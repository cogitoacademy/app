import type { EmailPort, EmailMessage } from "./email.service";
import { log } from "../../lib/logger";

export function createResendEmailProvider(
  apiKey: string,
  fromEmail: string,
): EmailPort {
  async function send(message: EmailMessage) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [message.to],
          subject: message.subject,
          html: message.html,
          tags: [{ name: "category", value: message.category }],
        }),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(`Resend API error: ${response.status} ${text}`);
      }

      const data = (await response.json()) as { id: string };
      return { messageId: data.id };
    } catch (error) {
      log({
        level: "error",
        action: "resend_email_send_failed",
        error: { message: String(error) },
        to: message.to,
        subject: message.subject,
      });
      throw error;
    }
  }

  return { send };
}
