import { afterEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";

import { db } from "@cogito-app/db";
import { user as userRow } from "@cogito-app/db/schema";
import { DEFAULT_PRODUCTION_ADMIN_EMAIL } from "@cogito-app/env/admin";
import { env } from "@cogito-app/env/server";

import {
  assertPasswordPolicy,
  auth,
  setAuthEmailSender,
  setVerificationEmailSender,
  setWelcomeEmailSender,
  resolveGoogleSocialProviders,
} from "./index";

const user = {
  id: "user-1",
  name: "Student",
  email: "student@example.com",
  emailVerified: false,
  image: null,
  role: "student",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const resetPassword = (auth as any).options.emailAndPassword.sendResetPassword;
const sendVerificationOTP = (auth as any).options.plugins[0].options
  .sendVerificationOTP;
const sendWelcome = (auth as any).options.databaseHooks.user.create.after;

afterEach(() => {
  setAuthEmailSender(null as any);
  setVerificationEmailSender(null as any);
  setWelcomeEmailSender(null as any);
});

describe("auth email hooks", () => {
  test("production signup promotes a configured operator account", async () => {
    const originalNodeEnv = env.NODE_ENV;
    const operatorId = crypto.randomUUID();
    const operator = {
      ...user,
      id: operatorId,
      email: DEFAULT_PRODUCTION_ADMIN_EMAIL,
    };

    await db.insert(userRow).values({
      id: operatorId,
      name: operator.name,
      email: operator.email,
      role: "student",
    });

    try {
      (env as { NODE_ENV: string }).NODE_ENV = "production";
      await sendWelcome(operator);

      const [promoted] = await db
        .select({ role: userRow.role })
        .from(userRow)
        .where(eq(userRow.id, operatorId));
      expect(promoted?.role).toBe("admin");
    } finally {
      await db.delete(userRow).where(eq(userRow.id, operatorId));
      (env as { NODE_ENV: string }).NODE_ENV = originalNodeEnv;
    }
  });

  test("production signup swallows operator promotion failures", async () => {
    const originalNodeEnv = env.NODE_ENV;
    const originalUpdate = (db as any).update;

    try {
      (env as { NODE_ENV: string }).NODE_ENV = "production";
      (db as any).update = () => {
        throw new Error("db unavailable");
      };

      await expect(
        sendWelcome({
          ...user,
          id: crypto.randomUUID(),
          email: DEFAULT_PRODUCTION_ADMIN_EMAIL,
        }),
      ).resolves.toBeUndefined();
    } finally {
      (db as any).update = originalUpdate;
      (env as { NODE_ENV: string }).NODE_ENV = originalNodeEnv;
    }
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

  test("verification hook is a no-op without a sender and forwards when set", async () => {
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
      type: "sign-in",
    });
    expect(calls).toEqual([
      { email: user.email, otp: "123456", type: "sign-in" },
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

  test("welcome hook is a no-op without a sender and forwards the login URL", async () => {
    await expect(sendWelcome(user)).resolves.toBeUndefined();

    const calls: unknown[] = [];
    setWelcomeEmailSender(async (params) => {
      calls.push(params);
    });
    await sendWelcome(user);
    expect(calls).toEqual([
      { user, loginUrl: `${env.CORS_ORIGIN.replace(/\/$/, "")}/login` },
    ]);
  });

  test("welcome hook swallows sender failures", async () => {
    setWelcomeEmailSender(async () => {
      throw new Error("mailer down");
    });

    await expect(sendWelcome(user)).resolves.toBeUndefined();
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

  test("returns the configured Google provider", () => {
    expect(
      resolveGoogleSocialProviders({
        clientId: "google-id",
        clientSecret: "google-secret",
      }),
    ).toEqual({
      google: {
        clientId: "google-id",
        clientSecret: "google-secret",
      },
    });
  });
});
