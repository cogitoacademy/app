export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  category: "booking" | "payment" | "refund" | "schedule" | "override";
  idempotencyKey?: string;
}

export interface EmailPort {
  send(
    message: EmailMessage,
  ): Promise<{ messageId: string } | { skipped: true }>;
}

export type EmailService = ReturnType<typeof createEmailService>;

export function createEmailService(provider: EmailPort) {
  async function send(message: EmailMessage) {
    return provider.send(message);
  }

  return { send };
}
