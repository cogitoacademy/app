import type { EmailPort } from "./email.service";
import { createEmailService } from "./email.service";
import { createStubEmailProvider } from "./stub-email.provider";
import { createResendEmailProvider } from "./resend-email.provider";
import type { EmailService } from "./email.service";
import type { RedisClient } from "../../lib/redis";

export type EmailModule = ReturnType<typeof createEmailModule>;

export function createEmailModule(deps: {
  resendApiKey?: string;
  emailFrom: string;
  redis?: RedisClient;
}) {
  const provider: EmailPort = deps.resendApiKey
    ? createResendEmailProvider(deps.resendApiKey, deps.emailFrom, deps.redis)
    : createStubEmailProvider();
  const service = createEmailService(provider);
  return { service };
}

export type { EmailService };
