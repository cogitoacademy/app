import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createEmailModule } from "../packages/api/src/modules/email/index.ts";
import { buildVerificationEmail } from "../packages/auth/src/verification-email.ts";

const recipient = "cogito-v3-mail-test@yopmail.com";
const expectedRecipient = "cogito-v3-mail-test@yopmail.com";
const metadataPath = resolve(
  "../../tmp/v3onlydev/resend-email-acceptance.json",
);
const subject = "[Cogito V3 TEST] Email delivery check";
const dummyOtp = "000000";

if (recipient !== expectedRecipient) {
  throw new Error(
    "Refusing to send: recipient does not match the authorized test address.",
  );
}

const priorMetadata = Bun.file(metadataPath);
if (await priorMetadata.exists()) {
  const previous = await priorMetadata.json();
  if (
    previous.status === "accepted_by_resend" ||
    previous.status === "sending" ||
    previous.status === "outcome_unknown"
  ) {
    throw new Error(
      "A prior send attempt is recorded; refusing to risk a duplicate email.",
    );
  }
}

const apiKey = process.env.RESEND_API_KEY;
const fromEmail = process.env.EMAIL_FROM;
const corsOrigin = process.env.CORS_ORIGIN;
if (!apiKey || !fromEmail || !corsOrigin) {
  throw new Error(
    "RESEND_API_KEY, EMAIL_FROM, and CORS_ORIGIN must be loaded from apps/server/.env.",
  );
}

const headerUrl = new URL("/auth-email-header.png", corsOrigin).href;
const verification = buildVerificationEmail({
  headerUrl,
  name: "Resend delivery test",
  otp: dummyOtp,
  expiresInMinutes: 5,
});
const expectedTemplateCopy = [
  "Verify your Cogito Academy email",
  "Use the code below to verify your Cogito Academy account email. It expires in 5 minutes.",
  "If you didn't create a Cogito Academy account, you can safely ignore this email.",
];
if (expectedTemplateCopy.some((copy) => !verification.html.includes(copy))) {
  throw new Error(
    "Verification email template changed; refusing to send an unreviewed test message.",
  );
}
const html = verification.html
  .replaceAll(
    "Verify your Cogito Academy email",
    "Cogito Academy email delivery test",
  )
  .replace(
    "Use the code below to verify your Cogito Academy account email. It expires in 5 minutes.",
    "This is a delivery test only. The code below is a dummy value, is not tied to an account, and cannot verify or access anything.",
  )
  .replace(
    "If you didn't create a Cogito Academy account, you can safely ignore this email.",
    "No account was created or changed. The code is only a test value and has no expiry.",
  );

const metadata = {
  status: "sending",
  requestedAtUtc: new Date().toISOString(),
  provider: "Resend",
  recipient,
  subject,
  template:
    "packages/auth/src/verification-email.ts buildVerificationEmail (branded auth layout; test-only copy and dummy code)",
  verificationScope:
    "A single test message sent to Resend; provider acceptance only, not inbox delivery.",
};
await mkdir(dirname(metadataPath), { recursive: true });
await Bun.write(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);

try {
  const { service } = createEmailModule({
    resendApiKey: apiKey,
    emailFrom: fromEmail,
  });
  const result = await service.send({
    to: recipient,
    subject,
    html,
    category: "auth",
  });
  if (!("messageId" in result) || !result.messageId) {
    throw new Error(
      "Resend provider returned no message ID; delivery acceptance was not confirmed.",
    );
  }

  const accepted = {
    ...metadata,
    status: "accepted_by_resend",
    acceptedAtUtc: new Date().toISOString(),
    resendMessageId: result.messageId,
  };
  await Bun.write(metadataPath, `${JSON.stringify(accepted, null, 2)}\n`);
  console.log(
    JSON.stringify({
      status: accepted.status,
      recipient,
      subject,
      resendMessageId: result.messageId,
    }),
  );
} catch (error) {
  const outcome = {
    ...metadata,
    status: "outcome_unknown",
    failureRecordedAtUtc: new Date().toISOString(),
    failure: error instanceof Error ? error.message : "Unknown provider error",
  };
  await Bun.write(metadataPath, `${JSON.stringify(outcome, null, 2)}\n`);
  throw error;
}
