import { describe, test, expect, beforeAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@cogito-app/db";
import { user, verification } from "@cogito-app/db/schema";

import { auth } from "@cogito-app/auth";
import { resetDatabase } from "../helpers/test-client";

describe("G2: email verification via email-otp plugin", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  const ts = Date.now();
  const email = `verify.g2.${ts}@cogito.test`;

  test("sign-up sends a verification OTP (verification row + sender invoked)", async () => {
    const sent: Array<{ email: string; otp: string; type: string }> = [];
    const { setVerificationEmailSender } = await import("@cogito-app/auth");
    setVerificationEmailSender(async (params) => {
      sent.push(params);
    });

    await auth.api.signUpEmail({
      body: { email, password: "Test1234!", name: "Verify G2" },
      headers: new Headers(),
    });

    // The plugin stores the OTP in the verification table under the
    // `email-verification-otp-{email}` identifier.
    const rows = await db
      .select()
      .from(verification)
      .where(eq(verification.identifier, `email-verification-otp-${email}`));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]!.value).toMatch(/^\d{6}/);

    // The sender was invoked with the OTP.
    expect(sent.length).toBe(1);
    expect(sent[0]!.email).toBe(email);
    expect(sent[0]!.otp).toMatch(/^\d{6}$/);
    expect(sent[0]!.type).toBe("email-verification");
  });

  test("verify-email with the correct OTP marks the user verified", async () => {
    const [row] = await db
      .select()
      .from(verification)
      .where(eq(verification.identifier, `email-verification-otp-${email}`))
      .limit(1);

    // The stored value is `{otp}:{attempts}` — split at the last colon.
    const otp = row!.value.split(":")[0]!;

    const result = await auth.api.verifyEmailOTP({
      body: { email, otp },
      headers: new Headers(),
    });

    expect(result.status).toBe(true);

    const [u] = await db.select().from(user).where(eq(user.email, email));
    expect(u!.emailVerified).toBe(true);
  });

  test("verify-email with a wrong OTP is rejected", async () => {
    await expect(
      auth.api.verifyEmailOTP({
        body: { email, otp: "000000" },
        headers: new Headers(),
      }),
    ).rejects.toThrow();
  });
});
