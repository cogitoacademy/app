import type { EmailPort, EmailMessage } from "../../shared/ports/email.port";
import { log } from "../../lib/logger";

async function stubSend(message: EmailMessage) {
  log({
    level: "info",
    action: "email_stub_send",
    to: message.to,
    subject: message.subject,
    category: message.category,
  });
  return { skipped: true } as const;
}

export function createStubEmailProvider(): EmailPort {
  return { send: stubSend };
}
