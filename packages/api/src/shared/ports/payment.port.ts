export type PaymentStatus =
  | "PENDING"
  | "PAID"
  | "SETTLED"
  | "FAILED"
  | "EXPIRED"
  | "REFUNDED";

export interface WebhookPayload {
  providerReference: string;
  providerEventId: string;
  status: PaymentStatus;
  receiptUrl?: string | null;
  failureReason?: string | null;
}

export interface PaymentProvider {
  createIntent(params: {
    paymentId: string;
    amountIdr: number;
    providerReference: string;
  }): Promise<{ checkoutUrl: string }>;
  verifyWebhook(rawBody: string, signature: string): Promise<WebhookPayload>;
}

export type PaymentPort = PaymentProvider;
