import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";

import {
  completePreAccountSignup,
  getPreAccountSignupOtpForTest,
  getPreAccountSignupOutcome,
  sendPreAccountSignupOtp,
  setPreAccountSignupEmailSender,
  setSignupReferralChoiceWriter,
  setSignupWelcomeEmailSender,
} from "@cogito-app/auth";
import { db } from "@cogito-app/db";
import {
  referralCampaign,
  referralChoice,
  referralCode,
  friendRewardDecision,
  referralSemesterUsage,
  user,
  verification,
  wallet,
} from "@cogito-app/db/schema";

import { resetDatabase } from "../helpers/test-client";
import { services } from "../../services";

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
  setSignupReferralChoiceWriter(services.referral.applyEmailSignupChoice);
}

async function sendCode(email: string, signupAttemptId = randomUUID()) {
  const result = await sendPreAccountSignupOtp({ email, signupAttemptId });
  if (!result.ok) throw new Error(`OTP send failed: ${result.error}`);
  const sent = sentOtps.findLast((message) => message.email === email);
  if (!sent) throw new Error("No OTP was captured by the test mail port.");
  return { signupAttemptId: result.signupAttemptId, otp: sent.otp };
}

async function complete(input: {
  email: string;
  signupAttemptId: string;
  otp: string;
  name?: string;
  password?: string;
  headers?: Headers;
  referralCode?: string;
}) {
  return completePreAccountSignup({
    email: input.email,
    password: input.password ?? "Test1234!",
    name: input.name ?? "Signup Test",
    otp: input.otp,
    signupAttemptId: input.signupAttemptId,
    referralCode: input.referralCode,
    headers: input.headers ?? new Headers(),
  });
}

describe("REQ-AUTH-01 pre-account email OTP", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  afterEach(() => {
    setPreAccountSignupEmailSender(null);
    setSignupReferralChoiceWriter(null);
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
    expect(cooldown).toMatchObject({
      ok: false,
      status: 429,
      signupAttemptId: attemptId,
    });
    const otherAttemptCooldown = await sendPreAccountSignupOtp({
      email,
      signupAttemptId: randomUUID(),
    });
    expect(otherAttemptCooldown).toMatchObject({ ok: false, status: 429 });
    expect(otherAttemptCooldown).not.toHaveProperty("signupAttemptId");
    expect(sentOtps).toHaveLength(1);

    await db
      .update(verification)
      .set({ createdAt: new Date(Date.now() - 61_000) })
      .where(eq(verification.identifier, `pre-account-signup-otp:${email}`));
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

  test("serializes concurrent sends for one email across attempt IDs", async () => {
    wireTestMail();
    const email = newEmail("send-race");
    const attemptIds = [randomUUID(), randomUUID()];

    const results = await Promise.all(
      attemptIds.map((signupAttemptId) =>
        sendPreAccountSignupOtp({ email, signupAttemptId }),
      ),
    );
    const sent = results.filter((result) => result.ok);
    const cooldown = results.find((result) => !result.ok);

    expect(sent).toHaveLength(1);
    expect(cooldown).toMatchObject({ ok: false, status: 429 });
    expect(cooldown).not.toHaveProperty("signupAttemptId");
    expect(sentOtps).toHaveLength(1);
  });

  test("resending with a new attempt ID invalidates the old proof", async () => {
    wireTestMail();
    const email = newEmail("attempt-rotate");
    const oldAttemptId = randomUUID();
    const first = await sendCode(email, oldAttemptId);

    await db
      .update(verification)
      .set({ createdAt: new Date(Date.now() - 61_000) })
      .where(eq(verification.identifier, `pre-account-signup-otp:${email}`));

    const newAttemptId = randomUUID();
    const second = await sendCode(email, newAttemptId);
    expect(second.otp).not.toBe(first.otp);

    expect(
      await complete({
        email,
        signupAttemptId: oldAttemptId,
        otp: first.otp,
      }),
    ).toMatchObject({ ok: false, status: 400 });
    expect(
      await complete({
        email,
        signupAttemptId: newAttemptId,
        otp: second.otp,
      }),
    ).toMatchObject({ ok: true });
  });

  test("reports mail failure without keeping a usable OTP", async () => {
    wireTestMail();
    const email = newEmail("mail-failure");
    let rejectedOtp = "";
    const logged: string[] = [];
    const originalConsoleError = console.error;
    setPreAccountSignupEmailSender(async ({ otp }) => {
      rejectedOtp = otp;
      throw new Error(`mail provider echoed ${otp}`);
    });

    console.error = (...args: unknown[]) => logged.push(args.join(" "));
    try {
      const result = await sendPreAccountSignupOtp({
        email,
        signupAttemptId: randomUUID(),
      });

      expect(result).toMatchObject({ ok: false, status: 502 });
      expect(rejectedOtp).toMatch(/^\d{6}$/);
      expect(JSON.stringify(result)).not.toContain(rejectedOtp);
      expect(logged.join(" ")).not.toContain(rejectedOtp);
      expect(
        await db.query.verification.findFirst({
          where: (row, { eq: equals }) =>
            equals(row.identifier, `pre-account-signup-otp:${email}`),
        }),
      ).toBeUndefined();
      expect(
        await db.query.user.findFirst({ where: eq(user.email, email) }),
      ).toBeUndefined();
    } finally {
      console.error = originalConsoleError;
    }
  });

  test("a stale mail failure cannot delete a newer resend proof or test capture", async () => {
    wireTestMail();
    const email = newEmail("stale-send-failure");
    let rejectFirstSend!: (reason?: unknown) => void;
    let markFirstSendStarted!: () => void;
    const firstSendStarted = new Promise<void>((resolve) => {
      markFirstSendStarted = resolve;
    });
    const firstSendGate = new Promise<void>((_resolve, reject) => {
      rejectFirstSend = reject;
    });
    let sendCount = 0;
    setPreAccountSignupEmailSender(async (params) => {
      sendCount += 1;
      if (sendCount === 1) {
        markFirstSendStarted();
        await firstSendGate;
        return;
      }
      sentOtps.push(params);
    });

    const firstAttemptId = randomUUID();
    const firstRequest = sendPreAccountSignupOtp({
      email,
      signupAttemptId: firstAttemptId,
    });
    try {
      await firstSendStarted;
      const firstProof = await db.query.verification.findFirst({
        where: (row, { eq: equals }) =>
          equals(row.identifier, `pre-account-signup-otp:${email}`),
      });
      expect(firstProof).toBeDefined();

      // Model the elapsed cooldown while the first provider request is still
      // pending; the following resend replaces this exact proof row.
      await db
        .update(verification)
        .set({ createdAt: new Date(Date.now() - 61_000) })
        .where(eq(verification.id, firstProof!.id));

      const replacement = await sendCode(email, randomUUID());
      const replacementProof = await db.query.verification.findFirst({
        where: (row, { eq: equals }) =>
          equals(row.identifier, `pre-account-signup-otp:${email}`),
      });
      expect(replacementProof).toBeDefined();
      expect(replacementProof!.id).not.toBe(firstProof!.id);
      expect(await getPreAccountSignupOtpForTest(email)).toBe(replacement.otp);

      rejectFirstSend(new Error("stale provider failure"));
      expect(await firstRequest).toMatchObject({ ok: false, status: 502 });
      const stillCurrentProof = await db.query.verification.findFirst({
        where: (row, { eq: equals }) =>
          equals(row.identifier, `pre-account-signup-otp:${email}`),
      });
      expect(stillCurrentProof?.id).toBe(replacementProof!.id);
      expect(await getPreAccountSignupOtpForTest(email)).toBe(replacement.otp);
      expect(
        await db.query.user.findFirst({ where: eq(user.email, email) }),
      ).toBeUndefined();
      expect(
        await complete({
          email,
          signupAttemptId: replacement.signupAttemptId,
          otp: replacement.otp,
        }),
      ).toMatchObject({ ok: true });
    } finally {
      rejectFirstSend(new Error("test cleanup"));
      await firstRequest.catch(() => undefined);
    }
  });

  test("rejects incorrect codes and locks after three failed attempts", async () => {
    wireTestMail();
    const email = newEmail("attempts");
    const { signupAttemptId, otp } = await sendCode(email);
    const wrongOtp = otp === "000000" ? "000001" : "000000";

    const failedAttempts = await Promise.all(
      Array.from({ length: 3 }, () =>
        complete({ email, signupAttemptId, otp: wrongOtp }),
      ),
    );
    expect(
      failedAttempts
        .map((result) => (result.ok ? 200 : result.status))
        .toSorted(),
    ).toEqual([400, 400, 429]);
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
      .where(eq(verification.identifier, `pre-account-signup-otp:${email}`));

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
    expect(
      await complete({ email, signupAttemptId: randomUUID(), otp }),
    ).toMatchObject({ ok: false, status: 400 });

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
      password: `Aa1${"x".repeat(126)}`,
    });
    expect(failedCreate).toMatchObject({ ok: false, status: 400 });
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
    const createdUser = await db.query.user.findFirst({
      where: eq(user.email, email),
    });
    expect(createdUser).toBeDefined();
    const choice = await db.query.referralChoice.findFirst({
      where: eq(referralChoice.userId, createdUser!.id),
    });
    expect(choice).toMatchObject({
      kind: "none",
      welcomeMarksSnapshot: 0,
      friendRewardMarksSnapshot: null,
    });
    const signupWallet = await db.query.wallet.findFirst({
      where: eq(wallet.userId, createdUser!.id),
    });
    expect(signupWallet).toBeUndefined();
  });

  test("saves friend attribution and the signup reward in the verified signup transaction", async () => {
    wireTestMail();
    const referrerId = `referrer-${randomUUID()}`;
    await db.insert(user).values({
      id: referrerId,
      name: "Referral Referrer",
      email: newEmail("referrer"),
      emailVerified: true,
      role: "student",
    });
    const referral = await services.referral.getMine(referrerId);
    const email = newEmail("referred");
    const { signupAttemptId, otp } = await sendCode(email);

    expect(
      await complete({
        email,
        signupAttemptId,
        otp,
        referralCode: referral.code,
      }),
    ).toMatchObject({ ok: true });

    const createdUser = await db.query.user.findFirst({
      where: eq(user.email, email),
    });
    expect(createdUser).toBeDefined();
    const choice = await db.query.referralChoice.findFirst({
      where: eq(referralChoice.userId, createdUser!.id),
    });
    expect(choice).toMatchObject({
      kind: "friend",
      codeSnapshot: referral.code,
      referrerUserId: referrerId,
      welcomeMarksSnapshot: 15,
      friendRewardMarksSnapshot: 15,
    });
    const signupWallet = await db.query.wallet.findFirst({
      where: eq(wallet.userId, createdUser!.id),
    });
    expect(signupWallet).toMatchObject({
      totalBalance: 15,
      availableBalance: 15,
    });
  });

  test("accepts an active KOL code and locks its commission terms at signup", async () => {
    wireTestMail();
    const adminId = `admin-${randomUUID()}`;
    await db.insert(user).values({
      id: adminId,
      name: "Referral Admin",
      email: newEmail("admin"),
      emailVerified: true,
      role: "admin",
    });
    const activationAt = new Date(Date.now() - 60_000);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60_000);
    const campaign = await services.referral.createKolCampaign(adminId, {
      name: "October creator campaign",
      code: "KOL2026",
      activationAt,
      expiresAt,
      attributionWindowDays: 90,
      flatAmountIdr: 0,
      percentBps: 1_000,
    });
    const email = newEmail("kol-referred");
    const { signupAttemptId, otp } = await sendCode(email);

    expect(
      await complete({ email, signupAttemptId, otp, referralCode: "kol2026" }),
    ).toMatchObject({ ok: true });

    const createdUser = await db.query.user.findFirst({
      where: eq(user.email, email),
    });
    expect(createdUser).toBeDefined();
    const choice = await db.query.referralChoice.findFirst({
      where: eq(referralChoice.userId, createdUser!.id),
    });
    expect(choice).toMatchObject({
      kind: "kol",
      codeSnapshot: "KOL2026",
      campaignId: campaign.id,
      welcomeMarksSnapshot: 15,
      friendRewardMarksSnapshot: null,
      kolFlatAmountIdrSnapshot: 0,
      kolPercentBpsSnapshot: 1_000,
    });
    expect(choice!.kolAttributionExpiresAt!.getTime()).toBeGreaterThan(
      choice!.decidedAt.getTime(),
    );
    expect(
      choice!.kolAttributionExpiresAt!.getTime() - choice!.decidedAt.getTime(),
    ).toBe(90 * 24 * 60 * 60_000);
    expect(
      await db.query.referralCode.findFirst({
        where: eq(referralCode.campaignId, campaign.id),
      }),
    ).toBeDefined();
    expect(
      await db.query.referralCampaign.findFirst({
        where: eq(referralCampaign.id, campaign.id),
      }),
    ).toBeDefined();
  });

  test("serializes semester cap across referrals and keeps a zero decision permanent", async () => {
    wireTestMail();
    const referrerId = `referrer-${randomUUID()}`;
    const adminId = `admin-${randomUUID()}`;
    await db.insert(user).values([
      {
        id: referrerId,
        name: "Cap Referrer",
        email: newEmail("cap-referrer"),
        emailVerified: true,
        role: "student",
      },
      {
        id: adminId,
        name: "Referral Admin",
        email: newEmail("referral-admin"),
        emailVerified: true,
        role: "admin",
      },
    ]);
    const referral = await services.referral.getMine(referrerId);
    await services.referral.updateSettings(adminId, {
      expectedVersion: 0,
      welcomeMarks: 15,
      friendRewardMarks: 15,
      semesterCapMarks: 10,
      reason: "Exercise concurrent referral cap in test",
    });

    async function signupReferred(label: string) {
      const email = newEmail(label);
      const { signupAttemptId, otp } = await sendCode(email);
      expect(
        await complete({
          email,
          signupAttemptId,
          otp,
          referralCode: referral.code,
        }),
      ).toMatchObject({ ok: true });
      const createdUser = await db.query.user.findFirst({
        where: eq(user.email, email),
      });
      if (!createdUser) throw new Error("Referred signup was not saved.");
      return createdUser.id;
    }

    const [firstStudentId, secondStudentId] = await Promise.all([
      signupReferred("cap-first"),
      signupReferred("cap-second"),
    ]);
    const completedAt = new Date();
    await Promise.all(
      [firstStudentId, secondStudentId].map((studentId) =>
        db.transaction((tx) =>
          services.referral.recordEligibleFirstCompletion(tx, {
            studentId,
            completionType: "solo",
            completionId: `cap-completion-${studentId}`,
            completedAt,
            chargedMarks: 15,
          }),
        ),
      ),
    );

    const cappedDecisions = await db
      .select({ creditedMarks: friendRewardDecision.creditedMarks })
      .from(friendRewardDecision)
      .where(eq(friendRewardDecision.referrerUserId, referrerId));
    expect(cappedDecisions.map((row) => row.creditedMarks).toSorted()).toEqual([
      0, 10,
    ]);
    const [usage] = await db
      .select({ creditedMarks: referralSemesterUsage.creditedMarks })
      .from(referralSemesterUsage)
      .where(eq(referralSemesterUsage.referrerUserId, referrerId));
    expect(usage?.creditedMarks).toBe(10);

    await services.referral.updateSettings(adminId, {
      expectedVersion: 1,
      welcomeMarks: 15,
      friendRewardMarks: 15,
      semesterCapMarks: 0,
      reason: "Exercise permanent zero reward in test",
    });
    const zeroStudentId = await signupReferred("cap-zero");
    const zeroCompletedAt = new Date();
    const zeroDecision = await db.transaction((tx) =>
      services.referral.recordEligibleFirstCompletion(tx, {
        studentId: zeroStudentId,
        completionType: "cohort",
        completionId: `zero-completion-${zeroStudentId}`,
        completedAt: zeroCompletedAt,
        chargedMarks: 1,
      }),
    );
    expect(zeroDecision?.creditedMarks).toBe(0);

    await services.referral.updateSettings(adminId, {
      expectedVersion: 2,
      welcomeMarks: 15,
      friendRewardMarks: 15,
      semesterCapMarks: 75,
      reason: "Raise cap after permanent zero decision in test",
    });
    const zeroReplay = await db.transaction((tx) =>
      services.referral.recordEligibleFirstCompletion(tx, {
        studentId: zeroStudentId,
        completionType: "masterclass",
        completionId: `later-completion-${zeroStudentId}`,
        completedAt: new Date(Date.now() + 10),
        chargedMarks: 1,
      }),
    );
    expect(zeroReplay?.id).toBe(zeroDecision?.id);
    expect(zeroReplay?.creditedMarks).toBe(0);
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
      await getPreAccountSignupOutcome({
        email: newEmail("outcome-other-email"),
        signupAttemptId,
      }),
    ).toBe(false);
    expect(
      await getPreAccountSignupOutcome({
        email,
        signupAttemptId: randomUUID(),
      }),
    ).toBe(false);
    expect(await complete({ email, signupAttemptId, otp })).toMatchObject({
      ok: false,
      status: 409,
    });
    expect(welcomedUserIds).toHaveLength(1);
  });
});
