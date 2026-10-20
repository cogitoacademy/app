import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";

import {
  completePreAccountSignup,
  getPreAccountSignupOutcome,
  sendPreAccountSignupOtp,
  setPreAccountSignupEmailSender,
  setSignupWelcomeEmailSender,
} from "@cogito-app/auth";
import { db } from "@cogito-app/db";
import { user, verification } from "@cogito-app/db/schema";

import { resetDatabase } from "../helpers/test-client";

type SentOtp = { email: string; otp: string };

const sentOtps: SentOtp[] = [];
const welcomedUserIds: string[] = [];

function newEmail(label: string) {
  return `${label}.${randomUUID()}@cogito.test`;
}

function wireTestMail() {
  sentOtps.length = 0;
  welcomedUserIds.length = 0;
  setPreAccountSignupEmailSender(async (params) => {
    sentOtps.push(params);
  });
  setSignupWelcomeEmailSender(async ({ user: signupUser }) => {
    welcomedUserIds.push(signupUser.id);
  });
}

async function sendCode(email: string, signupAttemptId = randomUUID()) {
  const result = await sendPreAccountSignupOtp({ email, signupAttemptId });
  if (!result.ok) throw new Error(`OTP send failed: ${result.error}`);
  const sent = sentOtps.at(-1);
  if (!sent) throw new Error("No OTP was captured by the test mail port.");
  return { signupAttemptId: result.signupAttemptId, otp: sent.otp };
}

async function complete(input: {
  email: string;
  signupAttemptId: string;
  otp: string;
  name?: string;
  headers?: Headers;
}) {
  return completePreAccountSignup({
    email: input.email,
    password: "Test1234!",
    name: input.name ?? "Signup Test",
    otp: input.otp,
    signupAttemptId: input.signupAttemptId,
    headers: input.headers ?? new Headers(),
  });
}

describe("REQ-AUTH-01 pre-account email OTP", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  afterEach(() => {
    setPreAccountSignupEmailSender(null);
    setSignupWelcomeEmailSender(null);
  });

  test("enforces the cooldown, replaces a resent code, and rejects the old code", async () => {
    wireTestMail();
    const email = newEmail("resend");
    const attemptId = randomUUID();
    const first = await sendCode(email, attemptId);

    const cooldown = await sendPreAccountSignupOtp({
      email,
      signupAttemptId: attemptId,
    });
    expect(cooldown).toMatchObject({ ok: false, status: 429 });
    expect(sentOtps).toHaveLength(1);

    await db
      .update(verification)
      .set({ createdAt: new Date(Date.now() - 61_000) })
      .where(
        eq(verification.identifier, `pre-account-signup-otp:${email}`),
      );
    const second = await sendCode(email, attemptId);
    expect(second.otp).not.toBe(first.otp);

    const oldCode = await complete({
      email,
      signupAttemptId: attemptId,
      otp: first.otp,
    });
    expect(oldCode.ok).toBe(false);
    const newCode = await complete({
      email,
      signupAttemptId: attemptId,
      otp: second.otp,
    });
    expect(newCode.ok).toBe(true);
    expect(
      await db.query.user.findFirst({ where: eq(user.email, email) }),
    ).toMatchObject({ emailVerified: true });
  });

  test("reports mail failure without keeping a usable OTP", async () => {
    wireTestMail();
    const email = newEmail("mail-failure");
    setPreAccountSignupEmailSender(async () => {
      throw new Error("mail provider unavailable");
    });

    expect(
      await sendPreAccountSignupOtp({ email, signupAttemptId: randomUUID() }),
    ).toMatchObject({ ok: false, status: 502 });
    expect(
      await db.query.verification.findFirst({
        where: (row, { eq: equals }) =>
          equals(row.identifier, `pre-account-signup-otp:${email}`),
      }),
    ).toBeUndefined();
  });

  test("rejects incorrect codes and locks after three failed attempts", async () => {
    wireTestMail();
    const email = newEmail("attempts");
    const { signupAttemptId, otp } = await sendCode(email);
    const wrongOtp = otp === "000000" ? "000001" : "000000";

    expect(
      await complete({ email, signupAttemptId, otp: wrongOtp }),
    ).toMatchObject({ ok: false, status: 400 });
    expect(
      await complete({ email, signupAttemptId, otp: wrongOtp }),
    ).toMatchObject({ ok: false, status: 400 });
    expect(
      await complete({ email, signupAttemptId, otp: wrongOtp }),
    ).toMatchObject({ ok: false, status: 429 });
    expect(await complete({ email, signupAttemptId, otp })).toMatchObject({
      ok: false,
      status: 429,
    });
  });

  test("rejects an expired code", async () => {
    wireTestMail();
    const email = newEmail("expired");
    const { signupAttemptId, otp } = await sendCode(email);
    await db
      .update(verification)
      .set({ expiresAt: new Date(Date.now() - 1) })
      .where(
        eq(verification.identifier, `pre-account-signup-otp:${email}`),
      );

    expect(await complete({ email, signupAttemptId, otp })).toMatchObject({
      ok: false,
      status: 400,
      error: "This code has expired. Send a new code.",
    });
  });

  test("binds the proof to its email and preserves it for the original email", async () => {
    wireTestMail();
    const email = newEmail("original");
    const changedEmail = newEmail("changed");
    const { signupAttemptId, otp } = await sendCode(email);

    expect(
      await complete({ email: changedEmail, signupAttemptId, otp }),
    ).toMatchObject({ ok: false });
    expect(
      await db.query.user.findFirst({ where: eq(user.email, changedEmail) }),
    ).toBeUndefined();

    expect(await complete({ email, signupAttemptId, otp })).toMatchObject({
      ok: true,
    });
  });

  test("rolls back a rejected create and accepts a retry with the valid proof", async () => {
    wireTestMail();
    const email = newEmail("retry");
    const { signupAttemptId, otp } = await sendCode(email);

    const failedCreate = await complete({
      email,
      signupAttemptId,
      otp,
      headers: new Headers({ origin: "https://untrusted.example" }),
    });
    expect(failedCreate.ok).toBe(false);
    expect(
      await db.query.user.findFirst({ where: eq(user.email, email) }),
    ).toBeUndefined();
    expect(
      await db.query.verification.findFirst({
        where: (row, { eq: equals }) =>
          equals(row.identifier, `pre-account-signup-otp:${email}`),
      }),
    ).toBeDefined();
    expect(welcomedUserIds).toHaveLength(0);

    expect(await complete({ email, signupAttemptId, otp })).toMatchObject({
      ok: true,
    });
    expect(welcomedUserIds).toHaveLength(1);
  });

  test("concurrent consume creates one account and one welcome and records outcome", async () => {
    wireTestMail();
    const email = newEmail("concurrent");
    const { signupAttemptId, otp } = await sendCode(email);

    const results = await Promise.all([
      complete({ email, signupAttemptId, otp }),
      complete({ email, signupAttemptId, otp }),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toHaveLength(1);
    expect(
      await db.select({ id: user.id }).from(user).where(eq(user.email, email)),
    ).toHaveLength(1);
    expect(welcomedUserIds).toHaveLength(1);
    expect(await getPreAccountSignupOutcome({ email, signupAttemptId })).toBe(
      true,
    );
    expect(
      await complete({ email, signupAttemptId, otp }),
    ).toMatchObject({ ok: false, status: 409 });
    expect(welcomedUserIds).toHaveLength(1);
  });
});
