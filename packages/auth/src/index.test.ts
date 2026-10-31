import { afterEach, describe, expect, test, mock, spyOn } from "bun:test";
import * as betterAuthModule from "better-auth";
import { createHmac } from "node:crypto";
import * as nodeCrypto from "node:crypto";
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
  getPreAccountSignupOutcome,
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
  test("signup outcome recovery validates identity, email ownership, and expiry", async () => {
    const attempt = crypto.randomUUID();
    const future = new Date(Date.now() + 60000);
    const results = [
      [],
      [{ value: "other@example.com", expiresAt: future }],
      [{ value: "student@example.com", expiresAt: new Date(0) }],
      [{ value: "student@example.com", expiresAt: future }],
    ];
    const select = spyOn(db, "select").mockImplementation((() => {
      const query = {
        from: () => query,
        where: () => query,
        limit: async () => results.shift() ?? [],
      };
      return query;
    }) as any);
    try {
      expect(
        await getPreAccountSignupOutcome({
          email: "invalid",
          signupAttemptId: attempt,
        }),
      ).toBe(false);
      expect(
        await getPreAccountSignupOutcome({
          email: "student@example.com",
          signupAttemptId: "invalid",
        }),
      ).toBe(false);
      expect(select).not.toHaveBeenCalled();
      for (const expected of [false, false, false, true]) {
        expect(
          await getPreAccountSignupOutcome({
            email: " Student@Example.com ",
            signupAttemptId: attempt,
          }),
        ).toBe(expected);
      }
      expect(results).toEqual([]);
    } finally {
      select.mockRestore();
    }
  });

  test.each([
    "initial",
    "resend",
    "cooldown-matching",
    "cooldown-other",
    "mail-failure",
  ] as const)("pre-account OTP delivery %s", async (scenario) => {
    const email = `otp-${crypto.randomUUID()}@example.com`;
    const signupAttemptId = crypto.randomUUID();
    const priorDigest = createHmac("sha256", env.BETTER_AUTH_SECRET)
      .update(`${email}\0${"123456"}`)
      .digest("hex");
    const current =
      scenario === "initial" || scenario === "mail-failure"
        ? []
        : [
            {
              id: "old-proof",
              value: `${priorDigest}:0:${scenario === "cooldown-other" ? crypto.randomUUID() : signupAttemptId}`,
              createdAt: new Date(
                Date.now() - (scenario === "resend" ? 120000 : 0),
              ),
            },
          ];
    let inserted: any;
    const remove = mock(async () => undefined);
    const tx = {
      execute: async () => undefined,
      select: () => {
        const query = {
          from: () => query,
          where: () => query,
          orderBy: () => query,
          limit: async () => current,
        };
        return query;
      },
      delete: () => ({ where: remove }),
      insert: () => ({
        values: async (row: unknown) => {
          inserted = row;
        },
      }),
    };
    const transaction = spyOn(db, "transaction").mockImplementation((async (
      fn: (tx: unknown) => Promise<unknown>,
    ) => fn(tx)) as any);
    const select = spyOn(db, "select").mockImplementation((() => {
      const query = {
        from: () => query,
        where: () => query,
        limit: async () => (inserted ? [inserted] : []),
      };
      return query;
    }) as any);
    const deletion = spyOn(db, "delete").mockImplementation((() => ({
      where: remove,
    })) as any);
    const sender = mock(async (_params: { email: string; otp: string }) => {
      if (scenario === "mail-failure") throw new Error("provider failed");
    });
    setPreAccountSignupEmailSender(sender);
    try {
      const result = await sendPreAccountSignupOtp({ email, signupAttemptId });
      if (scenario.startsWith("cooldown")) {
        expect(result).toMatchObject({ ok: false, status: 429 });
        expect("signupAttemptId" in result).toBe(
          scenario === "cooldown-matching",
        );
        expect(sender).not.toHaveBeenCalled();
        expect(inserted).toBeUndefined();
      } else if (scenario === "mail-failure") {
        expect(result).toMatchObject({ ok: false, status: 502 });
        expect(remove).toHaveBeenCalledTimes(2);
      } else {
        expect(result).toMatchObject({ ok: true, signupAttemptId });
        expect(sender).toHaveBeenCalledTimes(1);
        const sent = sender.mock.calls[0]![0];
        expect(sent.email).toBe(email);
        expect(sent.otp).toMatch(/^\d{6}$/);
        if (scenario === "resend") expect(sent.otp).not.toBe("123456");
        expect(inserted.value).not.toContain(sent.otp);
        expect(inserted.value).toContain(signupAttemptId);
      }
    } finally {
      transaction.mockRestore();
      select.mockRestore();
      deletion.mockRestore();
    }
  });
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

describe("pre-account signup outcome reconciliation", () => {
  test.each([
    "other-email",
    "expired-outcome",
    "existing-account",
    "welcome-failure",
    "no-welcome",
    "production-signup",
  ] as const)(
    "reconciles %s without duplicate signup side effects",
    async (scenario) => {
      const email = "reconcile@example.com";
      const originalNodeEnv = env.NODE_ENV;
      if (scenario === "production-signup")
        (env as { NODE_ENV: string }).NODE_ENV = "production";
      const attempt = crypto.randomUUID();
      const digest = createHmac("sha256", env.BETTER_AUTH_SECRET)
        .update(`${email}\0${"123456"}`)
        .digest("hex");
      const results: unknown[][] = [
        scenario === "other-email"
          ? [
              {
                value: "other@example.com",
                expiresAt: new Date(Date.now() + 60000),
              },
            ]
          : scenario === "expired-outcome"
            ? [{ id: "expired-outcome", value: email, expiresAt: new Date(0) }]
            : [],
        ...(scenario === "other-email"
          ? []
          : [
              [
                {
                  id: "proof-id",
                  value: `${digest}:0:${attempt}`,
                  expiresAt: new Date(Date.now() + 60000),
                },
              ],
              scenario === "existing-account" ? [{ id: "existing-user" }] : [],
            ]),
      ];
      const removed: unknown[] = [];
      const saved: unknown[] = [];
      const tx = {
        execute: async () => undefined,
        select: () => {
          const query = {
            from: () => query,
            where: () => query,
            orderBy: () => query,
            limit: async () => {
              if (!results.length) throw new Error("Unexpected select");
              return results.shift();
            },
          };
          return query;
        },
        delete: () => ({
          where: async (condition: unknown) => {
            removed.push(condition);
          },
        }),
        insert: () => ({
          values: async (row: unknown) => {
            saved.push(row);
          },
        }),
      };
      const transaction = spyOn(db, "transaction").mockImplementation((async (
        fn: (conn: unknown) => Promise<unknown>,
      ) => fn(tx)) as any);
      let signupOptions: any;
      const signup = mock(async () => {
        const hook = signupOptions.databaseHooks.user.create.before;
        expect((await hook({ ...user, email })).data.emailVerified).toBe(true);
        expect(
          (await hook({ ...user, email: "unverified-other@example.com" })).data
            .emailVerified,
        ).toBe(false);
        return new Response(JSON.stringify({ user }), { status: 200 });
      });
      const factory = spyOn(betterAuthModule, "betterAuth").mockImplementation(
        ((options: unknown) => {
          signupOptions = options;
          return { api: { signUpEmail: signup } };
        }) as any,
      );
      const referral = mock(async () => undefined);
      const welcome = mock(async () => {
        throw new Error("private-mail-diagnostic");
      });
      setSignupReferralChoiceWriter(referral);
      setSignupWelcomeEmailSender(
        scenario === "welcome-failure" ? welcome : null,
      );
      const consoleError = spyOn(console, "error").mockImplementation(
        () => undefined,
      );
      try {
        const result = await completePreAccountSignup({
          email,
          password: "ValidPassword123!",
          name: "Student",
          otp: "123456",
          signupAttemptId: attempt,
          headers: new Headers(),
        });
        if (scenario === "other-email" || scenario === "existing-account") {
          expect(result).toMatchObject({ ok: false, status: 409 });
          expect(signup).not.toHaveBeenCalled();
          expect(referral).not.toHaveBeenCalled();
          expect(saved).toEqual([]);
        } else {
          expect(result.ok).toBe(true);
          expect(signup).toHaveBeenCalledTimes(1);
          expect(referral).toHaveBeenCalledTimes(1);
          expect(saved).toHaveLength(1);
          expect(removed).toHaveLength(scenario === "expired-outcome" ? 2 : 1);
          if (scenario === "welcome-failure") {
            expect(welcome).toHaveBeenCalledTimes(1);
            expect(consoleError).toHaveBeenCalledWith(
              expect.stringContaining("signup_welcome_email_send_failed"),
            );
            expect(consoleError).not.toHaveBeenCalledWith(
              expect.stringContaining("private-mail-diagnostic"),
            );
          }
        }
        expect(results).toEqual([]);
      } finally {
        transaction.mockRestore();
        factory.mockRestore();
        consoleError.mockRestore();
        (env as { NODE_ENV: string }).NODE_ENV = originalNodeEnv;
      }
    },
  );
  test("a malformed transaction result cannot produce a successful signup", async () => {
    const transaction = spyOn(db, "transaction").mockResolvedValue({
      kind: "created",
      user: null,
      response: null,
    } as never);
    setSignupReferralChoiceWriter(async () => undefined);
    try {
      expect(
        await completePreAccountSignup({
          email: "defensive@example.com",
          password: "ValidPassword123!",
          name: "Student",
          otp: "123456",
          signupAttemptId: crypto.randomUUID(),
          headers: new Headers(),
        }),
      ).toMatchObject({
        ok: false,
        status: 500,
        error: "We couldn't complete signup.",
      });
    } finally {
      transaction.mockRestore();
    }
  });
});

describe("captured signup proof lifecycle", () => {
  test.each([
    "expired",
    "deleted",
    "delivery-deleted",
    "production",
    "production-failure",
    "random-collision",
  ] as const)(
    "handles %s proof lifecycle without a real DB",
    async (scenario) => {
      const email = `lifecycle-${crypto.randomUUID()}@example.com`;
      const attempt = crypto.randomUUID();
      const originalEnv = env.NODE_ENV;
      let inserted: any;
      let proofExists = true;
      const digest = createHmac("sha256", env.BETTER_AUTH_SECRET)
        .update(`${email}\0${"123456"}`)
        .digest("hex");
      const tx = {
        execute: async () => undefined,
        select: () => {
          const query = {
            from: () => query,
            where: () => query,
            orderBy: () => query,
            limit: async () =>
              scenario === "random-collision"
                ? [{ value: `${digest}:0:${attempt}`, createdAt: new Date(0) }]
                : [],
          };
          return query;
        },
        delete: () => ({ where: async () => undefined }),
        insert: () => ({
          values: async (value: unknown) => {
            inserted = value;
          },
        }),
      };
      const transaction = spyOn(db, "transaction").mockImplementation((async (
        fn: (conn: unknown) => Promise<unknown>,
      ) => fn(tx)) as any);
      const select = spyOn(db, "select").mockImplementation((() => {
        const query = {
          from: () => query,
          where: () => query,
          limit: async () => (proofExists ? [inserted] : []),
        };
        return query;
      }) as any);
      const deletion = spyOn(db, "delete").mockImplementation((() => ({
        where: async () => undefined,
      })) as any);
      const errorLog = spyOn(console, "error").mockImplementation(
        () => undefined,
      );
      let random: ReturnType<typeof spyOn> | undefined;
      let time: ReturnType<typeof spyOn> | undefined;
      const sender = mock(async () => {
        if (scenario === "production-failure")
          throw new Error("private-provider-diagnostic");
        if (scenario === "delivery-deleted") proofExists = false;
      });
      setPreAccountSignupEmailSender(sender);
      try {
        if (scenario.startsWith("production"))
          (env as { NODE_ENV: string }).NODE_ENV = "production";
        if (scenario === "random-collision")
          random = spyOn(nodeCrypto, "randomInt")
            .mockReturnValueOnce(123456)
            .mockReturnValueOnce(654321) as any;
        const result = await sendPreAccountSignupOtp({
          email,
          signupAttemptId: attempt,
        });
        if (scenario === "production-failure") {
          expect(result).toMatchObject({ ok: false, status: 502 });
          expect(errorLog).not.toHaveBeenCalled();
          return;
        }
        expect(result.ok).toBe(true);
        expect(sender).toHaveBeenCalledTimes(1);
        if (scenario === "expired")
          time = spyOn(Date, "now").mockReturnValue(
            Date.now() + 3600000,
          ) as any;
        if (scenario === "deleted") proofExists = false;
        const captured = await getPreAccountSignupOtpForTest(email);
        if (scenario === "random-collision") expect(captured).toBe("654321");
        else expect(captured).toBeNull();
        if (scenario === "expired")
          expect(await getPreAccountSignupOtpForTest(email)).toBeNull();
      } finally {
        random?.mockRestore();
        time?.mockRestore();
        transaction.mockRestore();
        select.mockRestore();
        deletion.mockRestore();
        errorLog.mockRestore();
        (env as { NODE_ENV: string }).NODE_ENV = originalEnv;
      }
    },
  );
});

test("a late delivery failure preserves a newer successfully captured proof", async () => {
  const email = `delivery-race-${crypto.randomUUID()}@example.com`;
  let inserted: any;
  let rejectFirst!: (reason: Error) => void;
  let signalFirst!: () => void;
  const firstStarted = new Promise<void>((resolve) => {
    signalFirst = resolve;
  });
  let sends = 0;
  let newerOtp: string | undefined;
  const tx = {
    execute: async () => undefined,
    select: () => {
      const query = {
        from: () => query,
        where: () => query,
        orderBy: () => query,
        limit: async () => [],
      };
      return query;
    },
    delete: () => ({ where: async () => undefined }),
    insert: () => ({
      values: async (value: unknown) => {
        inserted = value;
      },
    }),
  };
  const transaction = spyOn(db, "transaction").mockImplementation((async (
    fn: (conn: unknown) => Promise<unknown>,
  ) => fn(tx)) as any);
  const select = spyOn(db, "select").mockImplementation((() => {
    const query = {
      from: () => query,
      where: () => query,
      limit: async () => [inserted],
    };
    return query;
  }) as any);
  const deletion = spyOn(db, "delete").mockImplementation((() => ({
    where: async () => undefined,
  })) as any);
  const errors = spyOn(console, "error").mockImplementation(() => undefined);
  setPreAccountSignupEmailSender(async ({ otp }) => {
    sends++;
    if (sends === 1) {
      signalFirst();
      await new Promise<void>((_resolve, reject) => {
        rejectFirst = reject;
      });
    } else newerOtp = otp;
  });
  try {
    const first = sendPreAccountSignupOtp({
      email,
      signupAttemptId: crypto.randomUUID(),
    });
    await firstStarted;
    expect(
      await sendPreAccountSignupOtp({
        email,
        signupAttemptId: crypto.randomUUID(),
      }),
    ).toMatchObject({ ok: true });
    expect(await getPreAccountSignupOtpForTest(email)).toBe(newerOtp!);
    rejectFirst(new Error("late provider delivery failure"));
    expect(await first).toMatchObject({ ok: false, status: 502 });
    expect(await getPreAccountSignupOtpForTest(email)).toBe(newerOtp!);
    expect(deletion).toHaveBeenCalledTimes(1);
  } finally {
    transaction.mockRestore();
    select.mockRestore();
    deletion.mockRestore();
    errors.mockRestore();
  }
});

test.each([
  "completed",
  "missing",
  "expired",
  "malformed",
  "foreign-attempt",
  "limited",
  "wrong",
  "last-wrong",
] as const)(
  "signup proof rejection %s does not create a new account",
  async (scenario) => {
    const email = "reject-proof@example.com";
    const attempt = crypto.randomUUID();
    const digest = createHmac("sha256", env.BETTER_AUTH_SECRET)
      .update(`${email}\0${"123456"}`)
      .digest("hex");
    const results: unknown[][] = [
      scenario === "completed"
        ? [{ value: email, expiresAt: new Date(Date.now() + 60000) }]
        : [],
      ...(scenario === "completed"
        ? []
        : [
            scenario === "missing"
              ? []
              : [
                  {
                    id: "proof",
                    value:
                      scenario === "malformed"
                        ? "invalid"
                        : `${digest}:${scenario === "limited" ? 3 : scenario === "last-wrong" ? 2 : 0}:${scenario === "foreign-attempt" ? crypto.randomUUID() : attempt}`,
                    expiresAt:
                      scenario === "expired"
                        ? new Date(0)
                        : new Date(Date.now() + 60000),
                  },
                ],
          ]),
    ];
    const updated: unknown[] = [];
    const tx = {
      execute: async () => undefined,
      select: () => {
        const query = {
          from: () => query,
          where: () => query,
          orderBy: () => query,
          limit: async () => {
            if (!results.length) throw new Error("Unexpected select");
            return results.shift();
          },
        };
        return query;
      },
      update: () => ({
        set: (value: unknown) => ({
          where: async () => {
            updated.push(value);
          },
        }),
      }),
    };
    const transaction = spyOn(db, "transaction").mockImplementation((async (
      fn: (conn: unknown) => Promise<unknown>,
    ) => fn(tx)) as any);
    const referral = mock(async () => undefined);
    setSignupReferralChoiceWriter(referral);
    try {
      const result = await completePreAccountSignup({
        email,
        password: "ValidPassword123!",
        name: "Student",
        otp:
          scenario === "wrong" || scenario === "last-wrong"
            ? "654321"
            : "123456",
        signupAttemptId: attempt,
        headers: new Headers(),
      });
      expect(result.ok).toBe(false);
      expect(result).toHaveProperty(
        "status",
        scenario === "completed"
          ? 409
          : scenario === "limited" || scenario === "last-wrong"
            ? 429
            : 400,
      );
      expect(referral).not.toHaveBeenCalled();
      expect(updated).toHaveLength(
        scenario === "wrong" || scenario === "last-wrong" ? 1 : 0,
      );
      expect(results).toEqual([]);
    } finally {
      transaction.mockRestore();
    }
  },
);
