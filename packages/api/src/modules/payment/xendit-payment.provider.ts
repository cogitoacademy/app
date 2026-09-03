import { timingSafeEqual } from "crypto";
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

const XENDIT_API_BASE = "https://api.xendit.co/v3";
const XENDIT_API_VERSION = "2024-11-11";

type XenditPaymentMethod = "ewallet_ovo" | "qris" | "va_bca";

export type XenditMode = "test" | "live";

// 2024-11-11 channel codes (channel_code enum in the Payments API).
const PAYMENT_METHOD_CONFIG: Record<
  XenditPaymentMethod,
  { channel_code: string }
> = {
  ewallet_ovo: { channel_code: "OVO" },
  qris: { channel_code: "QRIS" },
  va_bca: { channel_code: "BCA" },
};

/**
 * Maps Xendit Payment Request / Payment statuses (api-version 2024-11-11) to
 * the internal PaymentStatus.
 *
 *   SUCCEEDED        -> PAID
 *   REQUIRES_ACTION  -> PENDING (customer action pending)
 *   AUTHORIZED       -> PENDING (capture pending)
 *   CANCELED         -> FAILED
 *   PENDING/FAILED/EXPIRED/PAID/SETTLED/REFUNDED -> unchanged (legacy webhook
 *   events and our own stub use these verbatim)
 */
export function mapXenditStatus(status: string): PaymentStatus {
  const map: Record<string, PaymentStatus> = {
    SUCCEEDED: "PAID",
    REQUIRES_ACTION: "PENDING",
    AUTHORIZED: "PENDING",
    CANCELED: "FAILED",
    PENDING: "PENDING",
    PAID: "PAID",
    SETTLED: "SETTLED",
    FAILED: "FAILED",
    EXPIRED: "EXPIRED",
    REFUNDED: "REFUNDED",
  };
  const mapped = map[status];
  if (!mapped) throw internalServerError("Unknown payment status: " + status);
  return mapped;
}

export interface XenditCustomer {
  referenceId: string;
  givenNames: string;
  email: string;
  mobileNumber?: string;
}

export function createXenditPaymentProvider(opts: {
  secretKey: string;
  webhookToken: string;
  mode: XenditMode;
  successRedirectUrl: string;
  failureRedirectUrl: string;
  defaultPaymentMethod?: XenditPaymentMethod;
  customer?: XenditCustomer;
  redis?: RedisClient;
}): PaymentProvider {
  const xenditCircuitBreaker = new CircuitBreaker({
    failureThreshold: 5,
    resetTimeoutMs: 30_000,
    halfOpenMaxAttempts: 1,
    // Keep Test and Live breaker state separate in case an operator switches
    // modes without restarting Redis. Xendit itself selects the environment
    // from the API key; `mode` is our explicit deployment assertion only.
    name: `xendit-${opts.mode}`,
    redis: opts.redis ?? undefined,
    monitor: (state, error) => {
      log({
        level: state === "open" ? "error" : "info",
        action: "circuit_breaker_state_change",
        service: "xendit",
        xenditMode: opts.mode,
        state,
        error: error ? { message: String(error) } : undefined,
      });
    },
  });
  const authHeader = `Basic ${Buffer.from(`${opts.secretKey}:`).toString("base64")}`;
  const defaultMethod = opts.defaultPaymentMethod ?? "qris";
  const methodConfig = PAYMENT_METHOD_CONFIG[defaultMethod];

  async function createIntent(params: {
    paymentId: string;
    amountIdr: number;
    providerReference: string;
  }): Promise<{ checkoutUrl: string; paymentRequestId?: string | null }> {
    // 2024-11-11 request shape: type:"PAY", country:"ID", currency:"IDR",
    // request_amount (NOT amount), channel_code (NOT payment_method),
    // channel_properties vary by channel: redirects for e-wallet/VA and a
    // dynamic QR configuration for QRIS.
    const channelProperties =
      defaultMethod === "qris"
        ? {
            qr_string_type: "DYNAMIC",
            expires_at: new Date(
              Date.now() + 48 * 60 * 60 * 1000,
            ).toISOString(),
          }
        : {
            success_return_url: opts.successRedirectUrl,
            failure_return_url: opts.failureRedirectUrl,
          };

    const body: Record<string, unknown> = {
      reference_id: params.providerReference,
      type: "PAY",
      country: "ID",
      currency: "IDR",
      request_amount: params.amountIdr,
      channel_code: methodConfig.channel_code,
      channel_properties: channelProperties,
      metadata: {
        paymentId: params.paymentId,
      },
    };

    if (opts.customer) {
      body.customer = {
        reference_id: opts.customer.referenceId,
        given_names: opts.customer.givenNames,
        email: opts.customer.email,
        ...(opts.customer.mobileNumber
          ? { mobile_number: opts.customer.mobileNumber }
          : {}),
      };
    }

    const res = await xenditCircuitBreaker.execute(() =>
      retryWithBackoff(
        () =>
          fetchWithTimeout(`${XENDIT_API_BASE}/payment_requests`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "api-version": XENDIT_API_VERSION,
              authorization: authHeader,
            },
            body: JSON.stringify(body),
          }),
        {
          maxAttempts: 3,
          retryable: (err) =>
            err instanceof TypeError ||
            (err instanceof Error &&
              (err.name === "AbortError" || err.name === "TimeoutError")),
        },
      ),
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      let errCode: string | undefined;
      try {
        const errJson = JSON.parse(text);
        errCode = errJson.error_code;
      } catch {
        errCode = undefined;
      }
      throw serviceUnavailable(
        `Payment provider error: ${res.status} ${errCode ?? res.statusText}`,
      );
    }

    // 2024-11-11 responses are a TOP-LEVEL object (no `data` wrapper).
    const json = (await res.json()) as {
      id?: string;
      payment_request_id?: string;
      actions?: { type?: string; value?: string; descriptor?: string }[];
    };

    // Actions now carry {type, value, descriptor}: pick the customer redirect
    // URL first (e-wallets/VA), fall back to a present-to-customer value
    // (QRIS / VA number).
    const actions = json.actions ?? [];
    const checkoutUrl =
      actions.find((a) => a.type === "REDIRECT_CUSTOMER")?.value ??
      actions.find((a) => a.type === "PRESENT_TO_CUSTOMER")?.value;

    if (!checkoutUrl) {
      throw internalServerError("Payment provider returned invalid response");
    }

    // X1: the payment request id (`pr-...`) is what refunds address.
    const paymentRequestId = json.payment_request_id ?? json.id ?? null;

    return { checkoutUrl, paymentRequestId };
  }

  async function simulatePayment(paymentRequestId: string, amountIdr: number) {
    if (opts.mode !== "test") {
      throw badRequest("Payment simulation requires Xendit Test Mode");
    }
    const res = await xenditCircuitBreaker.execute(() =>
      retryWithBackoff(
        () =>
          fetchWithTimeout(
            `${XENDIT_API_BASE}/payment_requests/${encodeURIComponent(paymentRequestId)}/simulate`,
            {
              method: "POST",
              headers: {
                "content-type": "application/json",
                "api-version": XENDIT_API_VERSION,
                authorization: authHeader,
              },
              body: JSON.stringify({ amount: amountIdr }),
            },
          ),
        {
          maxAttempts: 3,
          retryable: (err) =>
            err instanceof TypeError ||
            (err instanceof Error &&
              (err.name === "AbortError" || err.name === "TimeoutError")),
        },
      ),
    );

    if (!res.ok) {
      throw serviceUnavailable(
        `Payment simulation error: ${res.status} ${res.statusText}`,
      );
    }
    const json = (await res.json()) as { message?: string };
    return {
      status: "PENDING" as const,
      message: json.message ?? "Simulated payment is being processed",
    };
  }

  async function verifyWebhook(
    rawBody: string,
    token: string,
  ): Promise<WebhookPayload> {
    const tokenBuf = new TextEncoder().encode(token);
    const expectedBuf = new TextEncoder().encode(opts.webhookToken);
    if (
      tokenBuf.length === 0 ||
      expectedBuf.length === 0 ||
      tokenBuf.length !== expectedBuf.length ||
      !timingSafeEqual(tokenBuf, expectedBuf)
    ) {
      throw unauthorized("Invalid webhook token");
    }

    let body: {
      event?: string;
      id?: string;
      payment_id?: string;
      payment_request_id?: string;
      reference_id?: string;
      status?: string;
      failure_code?: string;
      data?: {
        id?: string;
        payment_id?: string;
        payment_request_id?: string;
        reference_id?: string;
        status?: string;
        failure_code?: string;
      };
    };
    try {
      body = JSON.parse(rawBody);
    } catch {
      throw badRequest("Invalid webhook payload: malformed JSON");
    }

    const data = body.data ?? body;

    // 2024-11-11 webhooks: data.payment_id (payment events) or
    // data.payment_request_id (payment_request events) — there is NO event_id,
    // so deriving the idempotency key from these fields fixes the
    // `xendit:no-event-id` collision (every payment previously collapsed onto
    // one key).
    const providerEventId =
      data.payment_id ??
      data.payment_request_id ??
      data.id ??
      body.payment_id ??
      body.id ??
      "";

    return {
      providerReference: data.reference_id ?? data.id ?? "",
      providerEventId,
      status: mapXenditStatus(data.status ?? ""),
      failureReason: data.failure_code ?? null,
      receiptUrl: null,
    };
  }

  /**
   * Initiates a provider-side refund (POST /v3/refunds, api-version 2024-11-11).
   * Returns the provider refund id (rfd-...) for storage on refundRecord.
   */
  async function refund(
    paymentRequestId: string,
    amountIdr: number,
    reason = "CANCELLATION",
  ): Promise<{ providerRefundId: string }> {
    const res = await xenditCircuitBreaker.execute(() =>
      retryWithBackoff(
        () =>
          fetchWithTimeout(`${XENDIT_API_BASE}/refunds`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "api-version": XENDIT_API_VERSION,
              authorization: authHeader,
            },
            body: JSON.stringify({
              payment_request_id: paymentRequestId,
              currency: "IDR",
              amount: amountIdr,
              reason,
            }),
          }),
        {
          maxAttempts: 3,
          retryable: (err) =>
            err instanceof TypeError ||
            (err instanceof Error &&
              (err.name === "AbortError" || err.name === "TimeoutError")),
        },
      ),
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      let errCode: string | undefined;
      try {
        const errJson = JSON.parse(text);
        errCode = errJson.error_code;
      } catch {
        errCode = undefined;
      }
      throw serviceUnavailable(
        `Payment provider refund error: ${res.status} ${errCode ?? res.statusText}`,
      );
    }

    const json = (await res.json()) as { id?: string };
    if (!json.id) {
      throw internalServerError(
        "Payment provider returned invalid refund response",
      );
    }

    return { providerRefundId: json.id };
  }

  return { createIntent, simulatePayment, verifyWebhook, refund };
}
