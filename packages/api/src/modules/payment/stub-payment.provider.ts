import type { PaymentProvider, WebhookPayload } from "./payment.service";

export async function createIntent(params: {
  paymentId: string;
  amountIdr: number;
  providerReference: string;
}): Promise<{ checkoutUrl: string }> {
  return {
    checkoutUrl: `/webhooks/payments/stub/checkout?ref=${params.providerReference}`,
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
    if (!valid) throw new Error("Invalid webhook signature");

    return JSON.parse(rawBody) as WebhookPayload;
  }

  return { createIntent, verifyWebhook };
}
