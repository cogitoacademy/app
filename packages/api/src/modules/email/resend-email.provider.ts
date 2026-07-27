import type { EmailPort, EmailMessage } from "./email.service";
import { CircuitBreaker } from "../../lib/circuit-breaker";
import { serviceUnavailable } from "../../lib/errors";
import { log } from "../../lib/logger";

const resendBreaker = new CircuitBreaker({
  failureThreshold: 3,
  resetTimeoutMs: 120_000,
  halfOpenMaxAttempts: 1,
  monitor: (state, error) => {
    log({
      level: state === "open" ? "error" : "info",
      action: "circuit_breaker_state_change",
      service: "resend",
      state,
      error: error ? { message: String(error) } : undefined,
    });
  },
});

export function createResendEmailProvider(
  apiKey: string,
  fromEmail: string,
): EmailPort {
  async function send(message: EmailMessage) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await resendBreaker.execute(() =>
        fetch("https://api.resend.com/emails", {
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
          signal: controller.signal,
        }),
      );

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw serviceUnavailable(
          `Email service unavailable: ${response.status} ${text}`,
        );
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
    } finally {
      clearTimeout(timeout);
    }
  }

  return { send };
}
