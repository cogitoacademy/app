export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  category: "booking" | "payment" | "refund" | "schedule" | "override";
}

export interface EmailPort {
  send(
    message: EmailMessage,
  ): Promise<{ messageId: string } | { skipped: true }>;
}
