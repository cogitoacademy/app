import { createHash, timingSafeEqual } from "crypto";
import { CircuitBreaker } from "../../lib/circuit-breaker";
import {
  internalServerError,
  serviceUnavailable,
  unauthorized,
  badRequest,
} from "../../lib/errors";
import { log } from "../../lib/logger";
import { fetchWithTimeout, retryWithBackoff } from "../../lib/retry";
import type { RedisClient } from "../../lib/redis";
import type {
  PaymentProvider,
  PaymentStatus,
  WebhookPayload,
} from "./payment.service";

const MIDTRANS_SANDBOX_BASE = "https://app.sandbox.midtrans.com";
const MIDTRANS_PRODUCTION_BASE = "https://app.midtrans.com";
const MIDTRANS_API_SANDBOX_BASE = "https://api.sandbox.midtrans.com";
const MIDTRANS_API_PRODUCTION_BASE = "https://api.midtrans.com";

function isRetryableProviderError(err: unknown) {
  return (
    err instanceof TypeError ||
    (err instanceof Error &&
      (err.name === "AbortError" || err.name === "TimeoutError"))
  );
}

/**
 * Midtrans returns structured error bodies, but the provider message is not
 * guaranteed to be present (for example on a proxy-generated response). Keep
 * the diagnostic detail bounded and single-line before it is surfaced through
 * our domain error. Never include request headers or response bodies verbatim.
 */
function sanitizeProviderMessage(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const message = value.replace(/\s+/g, " ").trim();
  return message ? message.slice(0, 240) : undefined;
}

function sanitizeProviderCode(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const code = value.trim();
  return /^[A-Z0-9_]{1,100}$/.test(code) ? code : undefined;
}

async function throwProviderHttpError(
  response: Response,
  operation: string,
): Promise<never> {
  const text = await response.text().catch(() => "");
  let errorCode: string | undefined;
  let providerMessage: string | undefined;

  try {
    const body = JSON.parse(text) as {
      status_code?: unknown;
      status_message?: unknown;
      message?: unknown;
    };
    errorCode = sanitizeProviderCode(body.status_code);
    providerMessage = sanitizeProviderMessage(
      body.status_message ?? body.message,
    );
  } catch {
    // Some upstream/proxy errors are plain text. Do not echo that text because
    // it may contain HTML or infrastructure details; the HTTP status is enough.
  }

  const statusDetail = (errorCode ?? response.statusText) || "HTTP error";
  const messageDetail = providerMessage ? ` - ${providerMessage}` : "";
  throw serviceUnavailable(
    `${operation} error: ${response.status} ${statusDetail}${messageDetail}`,
  );
}

export type MidtransMode = "test" | "live";

/**
 * Maps Midtrans transaction statuses (Snap / Core API) to the internal
 * PaymentStatus.
 *
 *   capture          -> PAID (card captured; safe when fraud_status is absent
 *                       or "accept"; "challenge" stays PENDING, "deny" FAILED)
 *   settlement       -> SETTLED
 *   pending/authorize-> PENDING (customer action pending)
 *   deny/cancel/failure -> FAILED
 *   expire           -> EXPIRED
 *   refund/partial_refund -> REFUNDED
 */
export function mapMidtransStatus(
  status: string,
  fraudStatus?: string,
): PaymentStatus {
  switch (status) {
    case "capture":
      if (fraudStatus === "deny") return "FAILED";
      if (fraudStatus === "challenge") return "PENDING";
      return "PAID";
    case "settlement":
      return "SETTLED";
    case "pending":
    case "authorize":
      return "PENDING";
    case "deny":
    case "cancel":
    case "failure":
      return "FAILED";
    case "expire":
      return "EXPIRED";
    case "refund":
    case "partial_refund":
      return "REFUNDED";
    default:
      throw internalServerError("Unknown payment status: " + status);
  }
}

interface MidtransNotification {
  order_id?: string;
  status_code?: string;
  gross_amount?: string;
  signature_key?: string;
  transaction_id?: string;
  transaction_status?: string;
  fraud_status?: string;
  status_message?: string;
  merchant_id?: string;
}

/**
 * Verifies the Midtrans notification `signature_key`:
 * SHA512(order_id + status_code + gross_amount + signatureKey), where the
 * signature key is the configured webhook signature key or, when unset, the
 * Server Key (Midtrans has no separate webhook signature key — the Server Key
 * IS the signature key per the official docs).
 */
function verifySignatureKey(
  body: MidtransNotification,
  signatureKey: string,
): void {
  const { order_id, status_code, gross_amount, signature_key } = body;
  if (
    typeof order_id !== "string" ||
    typeof status_code !== "string" ||
    typeof gross_amount !== "string" ||
    typeof signature_key !== "string"
  ) {
    throw unauthorized("Invalid webhook signature");
  }
  const expected = createHash("sha512")
    .update(order_id + status_code + gross_amount + signatureKey)
    .digest("hex");
  const provided = signature_key.toLowerCase();
  if (
    expected.length !== provided.length ||
    !timingSafeEqual(
      new TextEncoder().encode(expected),
      new TextEncoder().encode(provided),
    )
  ) {
    throw unauthorized("Invalid webhook signature");
  }
}

export function createMidtransPaymentProvider(opts: {
  serverKey: string;
  merchantId: string;
  mode: MidtransMode;
  /** Optional dedicated webhook signature key; falls back to the Server Key. */
  webhookSignatureKey?: string;
  redis?: RedisClient;
  /**
   * Resolves a Midtrans order_id (our payment UUID) back to the stored
   * provider reference so webhook/status payloads can be matched to the
   * payment row. Falls back to the order_id itself when unset or unresolvable.
   */
  resolvePayment?: (
    paymentId: string,
  ) => Promise<{ providerReference: string } | null>;
}): PaymentProvider {
  const midtransCircuitBreaker = new CircuitBreaker({
    failureThreshold: 5,
    resetTimeoutMs: 30_000,
    halfOpenMaxAttempts: 1,
    // Keep Test and Live breaker state separate in case an operator switches
    // modes without restarting Redis. Midtrans itself selects the environment
    // from the API key; `mode` is our explicit deployment assertion only.
    name: `midtrans-${opts.mode}`,
    redis: opts.redis ?? undefined,
    monitor: (state, error) => {
      log({
        level: state === "open" ? "error" : "info",
        action: "circuit_breaker_state_change",
        service: "midtrans",
        midtransMode: opts.mode,
        state,
        error: error ? { message: String(error) } : undefined,
      });
    },
  });
  const authHeader = `Basic ${Buffer.from(`${opts.serverKey}:`).toString("base64")}`;
  const signatureKey = opts.webhookSignatureKey ?? opts.serverKey;
  const snapBase =
    opts.mode === "test" ? MIDTRANS_SANDBOX_BASE : MIDTRANS_PRODUCTION_BASE;
  const apiBase =
    opts.mode === "test"
      ? MIDTRANS_API_SANDBOX_BASE
      : MIDTRANS_API_PRODUCTION_BASE;

  async function resolveProviderReference(
    orderId: string,
  ): Promise<string | null> {
    if (!opts.resolvePayment) return null;
    try {
      const payment = await opts.resolvePayment(orderId);
      return payment?.providerReference ?? null;
    } catch {
      // A lookup failure must not reject the webhook; the caller falls back
      // to the order_id and the service's DB reference fallback.
      return null;
    }
  }

  async function createIntent(params: {
    paymentId: string;
    amountIdr: number;
    providerReference: string;
  }): Promise<{ checkoutUrl: string; paymentRequestId?: string | null }> {
    // Snap requires a unique order_id (max 50 chars, [A-Za-z0-9._~-]). The
    // provider reference (`midtrans:{userId}:{packageCode}[:{paymentId}]`)
    // contains colons and can exceed 50 chars, so the payment UUID is used as
    // order_id — it is unique per attempt (repurchase-safe) and valid. The
    // provider reference is still persisted on the payment row and recovered
    // from the DB when webhooks/status lookups arrive.
    const body: Record<string, unknown> = {
      transaction_details: {
        order_id: params.paymentId,
        gross_amount: params.amountIdr,
      },
    };

    const res = await midtransCircuitBreaker.execute(() =>
      retryWithBackoff(
        () =>
          fetchWithTimeout(`${snapBase}/snap/v1/transactions`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              accept: "application/json",
              authorization: authHeader,
            },
            body: JSON.stringify(body),
          }),
        {
          maxAttempts: 3,
          retryable: isRetryableProviderError,
        },
      ),
    );

    if (!res.ok) {
      await throwProviderHttpError(res, "Payment provider");
    }

    const json = (await res.json()) as {
      token?: string;
      redirect_url?: string;
    };
    if (!json.redirect_url) {
      throw internalServerError("Payment provider returned invalid response");
    }

    // The order_id (payment UUID) is what status lookups and refunds address.
    return {
      checkoutUrl: json.redirect_url,
      paymentRequestId: params.paymentId,
    };
  }

  async function getPaymentRequestStatus(
    orderId: string,
  ): Promise<WebhookPayload> {
    const res = await midtransCircuitBreaker.execute(() =>
      retryWithBackoff(
        () =>
          fetchWithTimeout(
            `${apiBase}/v2/${encodeURIComponent(orderId)}/status`,
            {
              headers: {
                accept: "application/json",
                authorization: authHeader,
              },
            },
          ),
        { maxAttempts: 3, retryable: isRetryableProviderError },
      ),
    );
    if (!res.ok) {
      await throwProviderHttpError(res, "Payment status");
    }
    const json = (await res.json()) as {
      transaction_status?: string;
      transaction_id?: string;
      order_id?: string;
      fraud_status?: string;
      status_message?: string;
    };
    const status = mapMidtransStatus(
      json.transaction_status ?? "",
      json.fraud_status,
    );
    const remoteOrderId = json.order_id ?? orderId;
    const providerReference =
      (await resolveProviderReference(remoteOrderId)) ?? remoteOrderId;
    return {
      providerReference,
      providerEventId: json.transaction_id ?? remoteOrderId,
      status,
      failureReason:
        status === "FAILED" || status === "EXPIRED"
          ? (sanitizeProviderMessage(json.status_message) ?? null)
          : null,
      receiptUrl: null,
    };
  }

  async function verifyWebhook(
    rawBody: string,
    _signature: string,
  ): Promise<WebhookPayload> {
    // Midtrans sends the signature inside the body (`signature_key`), not in
    // a header — the header argument is ignored for this provider.
    let body: MidtransNotification;
    try {
      body = JSON.parse(rawBody) as MidtransNotification;
    } catch {
      throw badRequest("Invalid webhook payload: malformed JSON");
    }

    verifySignatureKey(body, signatureKey);

    // Defense-in-depth: the signature proves Midtrans signed the payload, but
    // the merchant_id must be ours — a signed notification for a different
    // merchant (e.g. a misconfigured dashboard pointing at our URL) must not
    // be processed.
    if (body.merchant_id && body.merchant_id !== opts.merchantId) {
      throw unauthorized("Invalid webhook signature");
    }

    const orderId = body.order_id ?? "";
    const status = mapMidtransStatus(
      body.transaction_status ?? "",
      body.fraud_status,
    );
    const providerReference =
      (await resolveProviderReference(orderId)) ?? orderId;
    return {
      providerReference,
      providerEventId: body.transaction_id ?? orderId,
      status,
      failureReason:
        status === "FAILED" || status === "EXPIRED"
          ? (sanitizeProviderMessage(body.status_message) ?? null)
          : null,
      receiptUrl: null,
    };
  }

  /**
   * Initiates a provider-side refund (POST /v2/{order_id}/refund). Returns the
   * provider refund key for storage on refundRecord. Note: adminRefund never
   * invokes this (N1 — in-app Marks credits only); the port exists for a
   * future payment-error-only cash-refund flow.
   */
  async function refund(
    orderId: string,
    amountIdr: number,
    reason = "CANCELLATION",
  ): Promise<{ providerRefundId: string }> {
    const res = await midtransCircuitBreaker.execute(() =>
      retryWithBackoff(
        () =>
          fetchWithTimeout(
            `${apiBase}/v2/${encodeURIComponent(orderId)}/refund`,
            {
              method: "POST",
              headers: {
                "content-type": "application/json",
                accept: "application/json",
                authorization: authHeader,
              },
              body: JSON.stringify({ amount: amountIdr, reason }),
            },
          ),
        {
          maxAttempts: 3,
          retryable: isRetryableProviderError,
        },
      ),
    );

    if (!res.ok) {
      await throwProviderHttpError(res, "Payment provider refund");
    }

    const json = (await res.json()) as {
      refund_key?: string;
      transaction_id?: string;
    };
    const providerRefundId = json.refund_key ?? json.transaction_id;
    if (!providerRefundId) {
      throw internalServerError(
        "Payment provider returned invalid refund response",
      );
    }

    return { providerRefundId };
  }

  return {
    createIntent,
    getPaymentRequestStatus,
    verifyWebhook,
    refund,
    // Midtrans sandbox has no simulation endpoint (test payments use the
    // sandbox test cards on the Snap page), so simulatePayment is omitted.
  };
}
