import { afterEach, describe, expect, test, mock, spyOn } from "bun:test";
import * as betterAuthModule from "better-auth";
import { createHmac } from "node:crypto";
import { db } from "@cogito-app/db";

import { DEFAULT_PRODUCTION_ADMIN_EMAIL } from "@cogito-app/env/admin";
import { env } from "@cogito-app/env/server";

import {
  assertPasswordPolicy,
  auth,
  setAuthEmailSender,
  setPreAccountSignupEmailSender,
  setSignupReferralChoiceWriter,
  setSignupWelcomeEmailSender,
  setVerificationEmailSender,
  resolveGoogleSocialProviders,
  sendPreAccountSignupOtp,
  completePreAccountSignup,
  getPreAccountSignupOtpForTest,
} from "./index";

const user = {
  id: "user-1",
  name: "Student",
  email: "student@example.com",
  emailVerified: false,
  image: null,
  role: "student",
  referralChoicePending: false,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const resetPassword = (auth as any).options.emailAndPassword.sendResetPassword;
const sendVerificationOTP = (auth as any).options.plugins[0].options
  .sendVerificationOTP;
const beforeUserCreate = (auth as any).options.databaseHooks.user.create.before;

afterEach(() => {
  setAuthEmailSender(null as any);
  setVerificationEmailSender(null as any);
  setPreAccountSignupEmailSender(null);
  setSignupWelcomeEmailSender(null);
  setSignupReferralChoiceWriter(null);
});

const acceptedSignupBody = JSON.stringify({ user: { id: "new-student" } });

describe("auth email hooks", () => {
  test.each([
    {
      name: "non-JSON provider failure",
      body: "Upstream unavailable",
      providerStatus: 502,
      status: 502,
      error: "Unable to create account.",
    },
    {
      name: "provider message",
      body: JSON.stringify({ message: "Signup rejected" }),
      providerStatus: 400,
      status: 400,
      error: "Signup rejected",
    },
    {
      name: "non-string provider message",
      body: JSON.stringify({ message: {} }),
      providerStatus: 400,
      status: 400,
      error: "Unable to create account.",
    },
    {
      name: "student-only referral",
      body: acceptedSignupBody,
      providerStatus: 200,
      referralError: {
        code: "REFERRAL_STUDENT_ONLY",
        message: "Students only",
      },
      status: 403,
      error: "Students only",
    },
    {
      name: "referral without message",
      body: acceptedSignupBody,
      providerStatus: 200,
      referralError: { code: "REFERRAL_INVALID" },
      status: 400,
      error: "Referral choice could not be saved.",
    },
    {
      name: "invalid referral",
      body: acceptedSignupBody,
      providerStatus: 200,
      referralError: {
        code: "INVALID_REFERRAL_CODE",
        message: "Invalid referral",
      },
      status: 400,
      error: "Invalid referral",
    },
    {
      name: "self referral",
      body: acceptedSignupBody,
      providerStatus: 200,
      referralError: { code: "SELF_REFERRAL", message: "Self referral" },
      status: 400,
      error: "Self referral",
    },
    {
      name: "unexpected transaction error",
      body: acceptedSignupBody,
      providerStatus: 200,
      referralError: new Error("Private diagnostic"),
      status: 500,
      error:
        "We couldn't complete signup. Your code is still available to retry.",
    },
    {
      name: "non-object transaction error",
      body: acceptedSignupBody,
      providerStatus: 200,
      referralError: "Private diagnostic",
      status: 500,
      error:
        "We couldn't complete signup. Your code is still available to retry.",
    },
  ])("signup failures preserve the OTP proof: %s", async (scenario) => {
    const email = "failure@example.com";
    const signupAttemptId = crypto.randomUUID();
    const otp = "123456";
    const digest = createHmac("sha256", env.BETTER_AUTH_SECRET)
      .update(`${email}\0${otp}`)
      .digest("hex");
    const results = [
      [],
      [
        {
          id: "proof-id",
          value: `${digest}:0:${signupAttemptId}`,
          expiresAt: new Date(Date.now() + 300000),
        },
      ],
      [],
    ];
    const remove = mock(() => ({ where: async () => undefined }));
    const tx = {
      execute: async () => undefined,
      select: () => {
        const query = {
          from: () => query,
          where: () => query,
          orderBy: () => query,
          limit: async () => results.shift() ?? [],
        };
        return query;
      },
      delete: remove,
    };
    const transaction = spyOn(db, "transaction").mockImplementation((async (
      fn: (conn: unknown) => Promise<unknown>,
    ) => fn(tx)) as any);
    const factory = spyOn(betterAuthModule, "betterAuth").mockImplementation(
      (() => ({
        api: {
          signUpEmail: async () =>
            new Response(scenario.body, { status: scenario.providerStatus }),
        },
      })) as any,
    );
    const referralWriter = mock(async () => {
      if ("referralError" in scenario) throw scenario.referralError;
    });
    setSignupReferralChoiceWriter(referralWriter);
    try {
      await expect(
        completePreAccountSignup({
          email,
          password: "ValidPassword123!",
          name: "Student",
          otp,
          signupAttemptId,
          headers: new Headers(),
        }),
      ).resolves.toMatchObject({
        ok: false,
        status: scenario.status,
        error: scenario.error,
      });
      if ("referralError" in scenario)
        expect(referralWriter).toHaveBeenCalledTimes(1);
      else expect(referralWriter).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
      expect(results).toEqual([]);
    } finally {
      factory.mockRestore();
      transaction.mockRestore();
    }
  });
  test("pre-account signup rejects malformed requests and unavailable adapters before database access", async () => {
    const signupAttemptId = crypto.randomUUID();
    await expect(
      sendPreAccountSignupOtp({ email: "invalid", signupAttemptId }),
    ).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(
      sendPreAccountSignupOtp({
        email: "student@example.com",
        signupAttemptId: "invalid",
      }),
    ).resolves.toMatchObject({ ok: false, status: 400 });
    setPreAccountSignupEmailSender(null);
    await expect(
      sendPreAccountSignupOtp({
        email: "student@example.com",
        signupAttemptId,
      }),
    ).resolves.toMatchObject({ ok: false, status: 502 });
    const input = {
      email: "student@example.com",
      password: "ValidPassword123!",
      name: "Student",
      otp: "123456",
      signupAttemptId,
      headers: new Headers(),
    };
    await expect(
      completePreAccountSignup({ ...input, email: "invalid" }),
    ).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(
      completePreAccountSignup({ ...input, signupAttemptId: "invalid" }),
    ).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(
      completePreAccountSignup({ ...input, password: "weak" }),
    ).resolves.toMatchObject({ ok: false, status: 400 });
    await expect(
      completePreAccountSignup({ ...input, otp: "123" }),
    ).resolves.toMatchObject({
      ok: false,
      status: 400,
      error: "Enter the six-digit code.",
    });
    setSignupReferralChoiceWriter(null);
    await expect(completePreAccountSignup(input)).resolves.toMatchObject({
      ok: false,
      status: 503,
    });
  });

  test("the OTP fixture reader is unavailable outside test mode", async () => {
    const originalNodeEnv = env.NODE_ENV;
    try {
      (env as { NODE_ENV: string }).NODE_ENV = "production";
      await expect(
        getPreAccountSignupOtpForTest("student@example.com"),
      ).resolves.toBeNull();
    } finally {
      (env as { NODE_ENV: string }).NODE_ENV = originalNodeEnv;
    }
    await expect(
      getPreAccountSignupOtpForTest("not-captured@example.com"),
    ).resolves.toBeNull();
  });
  test("production signup stores the configured operator role on insert", async () => {
    const originalNodeEnv = env.NODE_ENV;
    try {
      (env as { NODE_ENV: string }).NODE_ENV = "production";
      const result = await beforeUserCreate(
        { ...user, email: DEFAULT_PRODUCTION_ADMIN_EMAIL },
        { path: "/callback/:id" },
      );
      expect(result.data.role).toBe("admin");
      expect(result.data.emailVerified).toBe(false);
      expect(result.data.referralChoicePending).toBeFalsy();
    } finally {
      (env as { NODE_ENV: string }).NODE_ENV = originalNodeEnv;
    }
  });

  test("ordinary signup keeps the default student role", async () => {
    const result = await beforeUserCreate(user);
    expect(result.data.role).toBe("student");
    expect(result.data.referralChoicePending).toBeFalsy();
  });

  test("new Google students are marked pending, but reused or email users are not", async () => {
    const googleStudent = await beforeUserCreate(user, {
      path: "/callback/:id",
    });
    const emailStudent = await beforeUserCreate(user, {
      path: "/sign-up/email",
    });
    const googleAdmin = await beforeUserCreate(
      { ...user, role: "admin" },
      { path: "/callback/:id" },
    );

    expect(googleStudent.data.referralChoicePending).toBe(true);
    expect(emailStudent.data.referralChoicePending).toBe(false);
    expect(googleAdmin.data.referralChoicePending).toBe(false);
  });

  test("reset-password hook is a no-op when no sender is configured", async () => {
    await expect(
      resetPassword({ user, url: "https://app.test/reset", token: "token" }),
    ).resolves.toBeUndefined();
  });

  test("reset-password hook forwards to the configured sender", async () => {
    const calls: unknown[] = [];
    setAuthEmailSender(async (params) => {
      calls.push(params);
    });

    await resetPassword({
      user,
      url: "https://app.test/reset",
      token: "token",
    });
    expect(calls).toEqual([
      { user, url: "https://app.test/reset", token: "token" },
    ]);
  });

  test("reset-password hook swallows sender failures", async () => {
    setAuthEmailSender(async () => {
      throw new Error("mailer down");
    });

    await expect(
      resetPassword({ user, url: "https://app.test/reset", token: "token" }),
    ).resolves.toBeUndefined();
  });

  test("verification hook is a no-op without a sender and forwards existing-account OTPs", async () => {
    await expect(
      sendVerificationOTP({
        email: user.email,
        otp: "123456",
        type: "email-verification",
      }),
    ).resolves.toBeUndefined();

    const calls: unknown[] = [];
    setVerificationEmailSender(async (params) => {
      calls.push(params);
    });
    await sendVerificationOTP({
      email: user.email,
      otp: "123456",
      type: "email-verification",
    });
    expect(calls).toEqual([
      {
        email: user.email,
        otp: "123456",
        type: "email-verification",
      },
    ]);

    calls.length = 0;
    await sendVerificationOTP({
      email: user.email,
      otp: "654321",
      type: "sign-in",
    });
    expect(calls).toEqual([
      { email: user.email, otp: "654321", type: "sign-in" },
    ]);
  });

  test("verification hook swallows sender failures", async () => {
    setVerificationEmailSender(async () => {
      throw new Error("mailer down");
    });

    await expect(
      sendVerificationOTP({
        email: user.email,
        otp: "123456",
        type: "forget-password",
      }),
    ).resolves.toBeUndefined();
  });
});

describe("assertPasswordPolicy", () => {
  test("requires uppercase, lowercase, and a digit", () => {
    expect(assertPasswordPolicy("lowercase1")).toContain("uppercase");
    expect(assertPasswordPolicy("UPPERCASE1")).toContain("lowercase");
    expect(assertPasswordPolicy("Lowercase")).toContain("digit");
    expect(assertPasswordPolicy("ValidPass1")).toBeNull();
  });
});

describe("resolveGoogleSocialProviders", () => {
  test("returns no provider when either credential is missing", () => {
    expect(resolveGoogleSocialProviders({ clientId: "id" })).toEqual({});
    expect(resolveGoogleSocialProviders({ clientSecret: "secret" })).toEqual(
      {},
    );
  });

  test("returns the configured Google provider with a consent prompt", () => {
    expect(
      resolveGoogleSocialProviders({
        clientId: "google-id",
        clientSecret: "google-secret",
      }),
    ).toEqual({
      google: {
        clientId: "google-id",
        clientSecret: "google-secret",
        prompt: "consent",
      },
    });
  });
});

describe("OAuth state cookie security", () => {
  test("allows the provider callback while keeping state cookie overrides scoped", () => {
    const advanced = (auth as any).options.advanced;

    expect(advanced.defaultCookieAttributes.sameSite).toBeDefined();
    expect(advanced.defaultCookieAttributes.httpOnly).toBe(true);
    expect(advanced.cookies.state.attributes).toEqual({ sameSite: "lax" });
    expect(advanced.cookies.oauth_state.attributes).toEqual({
      sameSite: "lax",
    });
  });
});
