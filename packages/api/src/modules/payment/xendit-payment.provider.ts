import { timingSafeEqual } from "crypto";
import type {
  PaymentProvider,
  PaymentStatus,
  WebhookPayload,
} from "../../shared/ports/payment.port";

const XENDIT_API_BASE = "https://api.xendit.co/v3";

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
}): PaymentProvider {
  const authHeader = `Basic ${Buffer.from(`${opts.secretKey}:`).toString("base64")}`;

  async function createIntent(params: {
    paymentId: string;
    amountIdr: number;
    providerReference: string;
  }): Promise<{ checkoutUrl: string }> {
    const res = await fetch(`${XENDIT_API_BASE}/payment_requests`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: authHeader,
      },
      body: JSON.stringify({
        reference_id: params.providerReference,
        currency: "IDR",
        amount: params.amountIdr,
        payment_method: {
          type: "EWALLET",
          ewallet: {
            channel_code: "ID_OVO",
          },
        },
        success_redirect_url: opts.successRedirectUrl,
        failure_redirect_url: opts.failureRedirectUrl,
        metadata: {
          paymentId: params.paymentId,
        },
      }),
    });

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
