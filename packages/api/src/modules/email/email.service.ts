import type { EmailPort, EmailMessage } from "../../shared/ports/email.port";

export type EmailService = ReturnType<typeof createEmailService>;

export function createEmailService(provider: EmailPort) {
  async function send(message: EmailMessage) {
    return provider.send(message);
  }

  return { send };
}
