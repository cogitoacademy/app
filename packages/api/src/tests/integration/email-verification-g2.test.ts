import { describe, test, expect, beforeAll } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@cogito-app/db";
import { user, verification } from "@cogito-app/db/schema";

import { auth, setVerificationEmailSender } from "@cogito-app/auth";
import { resetDatabase } from "../helpers/test-client";

describe("G2: existing-account email verification via email-otp plugin", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  const ts = Date.now();
  const email = `verify.g2.${ts}@cogito.test`;

  test("trusted signup does not send pre-account OTP; existing account can request one", async () => {
    const sent: Array<{
      email: string;
      otp: string;
      type: string;
    }> = [];
    setVerificationEmailSender(async (params) => {
      sent.push(params);
    });

    await auth.api.signUpEmail({
      body: { email, password: "Test1234!", name: "Verify G2" },
      headers: new Headers(),
    });

    expect(sent).toHaveLength(0);
    await auth.api.sendVerificationOTP({
      body: { email, type: "email-verification" },
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

    // This path is for an account that already exists; public signup sends
    // its own pre-account OTP and welcome mail only after creation commits.
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

  test("email OTP sign-in cannot send codes to or create unknown accounts", async () => {
    const unknownEmail = `unknown.signin.${Date.now()}@cogito.test`;
    const sent: string[] = [];
    setVerificationEmailSender(async ({ email: sentEmail }) => {
      sent.push(sentEmail);
    });

    const sendResult = await auth.api.sendVerificationOTP({
      body: { email: unknownEmail, type: "sign-in" },
      headers: new Headers(),
    });
    expect(sendResult.success).toBe(true);
    expect(sent).toEqual([]);

    const otp = await auth.api.createVerificationOTP({
      body: { email: unknownEmail, type: "sign-in" },
      headers: new Headers(),
    });
    await expect(
      auth.api.signInEmailOTP({
        body: { email: unknownEmail, otp },
        headers: new Headers(),
      }),
    ).rejects.toThrow();
    expect(
      await db.select().from(user).where(eq(user.email, unknownEmail)),
    ).toEqual([]);
  });

  test("existing account can sign in with email OTP and receives a valid session", async () => {
    const existingEmail = `existing.signin.${randomUUID()}@cogito.test`;
    await auth.api.signUpEmail({
      body: {
        email: existingEmail,
        password: "Test1234!",
        name: "Existing OTP Sign-in",
      },
      headers: new Headers(),
    });
    const [existingUser] = await db
      .select()
      .from(user)
      .where(eq(user.email, existingEmail));
    expect(existingUser).toBeDefined();

    const sent: Array<{ email: string; otp: string; type: string }> = [];
    setVerificationEmailSender(async (params) => {
      sent.push(params);
    });
    const sendResult = await auth.api.sendVerificationOTP({
      body: { email: existingEmail, type: "sign-in" },
      headers: new Headers(),
    });
    expect(sendResult.success).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ email: existingEmail, type: "sign-in" });
    expect(sent[0]!.otp).toMatch(/^\d{6}$/);

    const signInResponse = await auth.api.signInEmailOTP({
      body: { email: existingEmail, otp: sent[0]!.otp },
      headers: new Headers(),
      asResponse: true,
    });
    const sessionCookie = signInResponse.headers
      .getSetCookie()
      .find((cookie) => cookie.includes("better-auth.session_token"))
      ?.split(";")[0];
    expect(sessionCookie).toBeDefined();

    const session = await auth.api.getSession({
      headers: new Headers({ cookie: sessionCookie ?? "" }),
    });
    expect(session).toMatchObject({
      user: { id: existingUser!.id, email: existingEmail },
    });
  });
});
