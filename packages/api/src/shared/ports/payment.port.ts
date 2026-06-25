export interface PaymentIntent {
  paymentId: string;
  providerReference: string;
  providerCheckoutUrl?: string;
}

export interface PaymentConfirmation {
  paymentId: string;
  status: "succeeded" | "failed";
  marks: number;
  receiptUrl?: string;
  failureReason?: string;
}

export interface PaymentPort {
  createIntent(userId: string, packageCode: string): Promise<PaymentIntent>;
  confirmFromWebhook(
    providerEventId: string,
    body: unknown,
  ): Promise<PaymentConfirmation>;
}
