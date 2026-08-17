import type { PaymentProvider, WebhookPayload } from "./payment.service";
import { unauthorized } from "../../lib/errors";

export async function createIntent(params: {
  paymentId: string;
  amountIdr: number;
  providerReference: string;
}): Promise<{ checkoutUrl: string; paymentRequestId?: string | null }> {
  return {
    checkoutUrl: `/webhooks/payments/stub/checkout?ref=${params.providerReference}`,
    paymentRequestId: `pr-stub-${params.paymentId}`,
  };
}

export function createStubPaymentProvider(
  webhookSecret: string,
): PaymentProvider {
  async function verifyWebhook(
    rawBody: string,
    signature: string,
  ): Promise<WebhookPayload> {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(webhookSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      Buffer.from(signature, "hex"),
      new TextEncoder().encode(rawBody),
    );
    if (!valid) throw unauthorized("Invalid webhook signature");

    return JSON.parse(rawBody) as WebhookPayload;
  }

  // Stub refunds return a deterministic mock id (X1); no real money moves.
  async function refund(
    paymentRequestId: string,
    _amountIdr: number,
    _reason?: string,
  ): Promise<{ providerRefundId: string }> {
    return { providerRefundId: `rfd-stub-${paymentRequestId}` };
  }

  return { createIntent, verifyWebhook, refund };
}
