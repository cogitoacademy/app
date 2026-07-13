import { timingSafeEqual } from "crypto";
import { CircuitBreaker } from "../../lib/circuit-breaker";
import { fetchWithTimeout, retryWithBackoff } from "../../lib/retry";
import type {
  PaymentProvider,
  PaymentStatus,
  WebhookPayload,
} from "../../shared/ports/payment.port";

const XENDIT_API_BASE = "https://api.xendit.co/v3";

const xenditCircuitBreaker = new CircuitBreaker({
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
  halfOpenMaxAttempts: 1,
});

type XenditPaymentMethod = "ewallet_ovo" | "qris" | "va_bca";

const PAYMENT_METHOD_CONFIG: Record<
  XenditPaymentMethod,
  { type: string; channel_code?: string }
> = {
  ewallet_ovo: { type: "EWALLET", channel_code: "ID_OVO" },
  qris: { type: "QR_CODE", channel_code: "ID_DANA" },
  va_bca: { type: "VIRTUAL_ACCOUNT", channel_code: "BCA" },
};

export function mapXenditStatus(status: string): PaymentStatus {
  const map: Record<string, PaymentStatus> = {
    PENDING: "PENDING",
    PAID: "PAID",
    SETTLED: "SETTLED",
    FAILED: "FAILED",
    EXPIRED: "EXPIRED",
  };
  const mapped = map[status];
  if (!mapped) throw new Error(`Unknown Xendit status: ${status}`);
  return mapped;
}

export function createXenditPaymentProvider(opts: {
  secretKey: string;
  webhookToken: string;
  successRedirectUrl: string;
  failureRedirectUrl: string;
  defaultPaymentMethod?: XenditPaymentMethod;
}): PaymentProvider {
  const authHeader = `Basic ${Buffer.from(`${opts.secretKey}:`).toString("base64")}`;
  const defaultMethod = opts.defaultPaymentMethod ?? "ewallet_ovo";
  const methodConfig = PAYMENT_METHOD_CONFIG[defaultMethod];

  async function createIntent(params: {
    paymentId: string;
    amountIdr: number;
    providerReference: string;
  }): Promise<{ checkoutUrl: string }> {
    const paymentMethodBody: Record<string, unknown> = {
      type: methodConfig.type,
    };

    if (methodConfig.type === "EWALLET") {
      paymentMethodBody.ewallet = { channel_code: methodConfig.channel_code };
    } else if (methodConfig.type === "QR_CODE") {
      paymentMethodBody.qr_code = { channel_code: methodConfig.channel_code };
    } else if (methodConfig.type === "VIRTUAL_ACCOUNT") {
      paymentMethodBody.virtual_account = {
        channel_code: methodConfig.channel_code,
      };
    }

    const res = await xenditCircuitBreaker.execute(() =>
      retryWithBackoff(
        () =>
          fetchWithTimeout(`${XENDIT_API_BASE}/payment_requests`, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              authorization: authHeader,
            },
            body: JSON.stringify({
              reference_id: params.providerReference,
              currency: "IDR",
              amount: params.amountIdr,
              payment_method: paymentMethodBody,
              success_redirect_url: opts.successRedirectUrl,
              failure_redirect_url: opts.failureRedirectUrl,
              metadata: {
                paymentId: params.paymentId,
              },
            }),
          }),
        {
          maxAttempts: 3,
          retryable: (err) => err instanceof TypeError,
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
      throw new Error(
        `Xendit API error: ${res.status} ${errCode ?? res.statusText}`,
      );
    }

    const json = (await res.json()) as {
      data: {
        actions?: { url: string }[];
        payment_method?: { url?: string };
      };
    };

    const checkoutUrl =
      json.data.actions?.[0]?.url ?? json.data.payment_method?.url;

    if (!checkoutUrl) {
      throw new Error("Xendit API error: no checkout URL in response");
    }

    return { checkoutUrl };
  }

  async function verifyWebhook(
    rawBody: string,
    token: string,
  ): Promise<WebhookPayload> {
    const tokenBuf = new TextEncoder().encode(token);
    const expectedBuf = new TextEncoder().encode(opts.webhookToken);
    if (
      tokenBuf.length !== expectedBuf.length ||
      !timingSafeEqual(tokenBuf, expectedBuf)
    ) {
      throw new Error("Invalid webhook token");
    }

    let body: {
      event_id?: string;
      id?: string;
      data?: {
        id?: string;
        reference_id?: string;
        status: string;
        failure_code?: string;
        receipt_url?: string;
      };
    };
    try {
      body = JSON.parse(rawBody);
    } catch {
      throw new Error("Invalid webhook payload: malformed JSON");
    }

    const data = (body.data ?? body) as {
      id?: string;
      reference_id?: string;
      status: string;
      failure_code?: string;
      receipt_url?: string;
    };

    return {
      providerReference: data.reference_id ?? data.id ?? "",
      providerEventId: body.event_id ?? body.id ?? "",
      status: mapXenditStatus(data.status),
      failureReason: data.failure_code ?? null,
      receiptUrl: data.receipt_url ?? null,
    };
  }

  return { createIntent, verifyWebhook };
}
