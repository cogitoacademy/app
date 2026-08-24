import { describe, expect, test } from "bun:test";
import { serverEnvSchema } from "./server";

function baseEnv() {
  return {
    DATABASE_URL: "postgresql://postgres:password@localhost:5432/cogito-test",
    BETTER_AUTH_SECRET: "ci-secret-at-least-32-characters-long-xxxx",
    BETTER_AUTH_URL: "http://localhost:3001",
    CORS_ORIGIN: "http://localhost:3000",
    NODE_ENV: "test" as const,
    PAYMENT_PROVIDER: "stub" as const,
    PAYMENT_WEBHOOK_SECRET:
      "ci-payment-webhook-secret-at-least-32-characters-long",
    REDIS_URL: "redis://localhost:6379",
  };
}

describe("server environment schema", () => {
  test("parses boolean env spellings and defaults", () => {
    const result = serverEnvSchema.parse({
      ...baseEnv(),
      TRUST_PROXY: " true ",
      SCHEDULER_ENABLED: "0",
      GOOGLE_MEET_ENABLED: false,
      DB_SSL_ENABLED: "",
      DB_SSL_REJECT_UNAUTHORIZED: "",
    });

    expect(result.TRUST_PROXY).toBe(true);
    expect(result.SCHEDULER_ENABLED).toBe(false);
    expect(result.GOOGLE_MEET_ENABLED).toBe(false);
    expect(result.DB_SSL_ENABLED).toBe(true);
    expect(result.DB_SSL_REJECT_UNAUTHORIZED).toBe(true);
  });

  test("rejects unknown boolean strings", () => {
    const result = serverEnvSchema.safeParse({
      ...baseEnv(),
      TRUST_PROXY: "sometimes",
    });
    expect(result.success).toBe(false);
  });

  test("requires Xendit credentials and redirect URLs when selected", () => {
    const result = serverEnvSchema.safeParse({
      ...baseEnv(),
      PAYMENT_PROVIDER: "xendit",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual(
        expect.arrayContaining([
          "XENDIT_SECRET_KEY",
          "XENDIT_WEBHOOK_TOKEN",
          "XENDIT_SUCCESS_REDIRECT_URL",
          "XENDIT_FAILURE_REDIRECT_URL",
        ]),
      );
    }
  });

  test("requires production email and R2 configuration", () => {
    const missing = serverEnvSchema.safeParse({
      ...baseEnv(),
      NODE_ENV: "staging",
    });
    expect(missing.success).toBe(false);

    const partialR2 = serverEnvSchema.safeParse({
      ...baseEnv(),
      NODE_ENV: "production",
      RESEND_API_KEY: "resend-key",
      EMAIL_FROM: "verified@cogitoacademy.id",
      R2_ACCOUNT_ID: "account",
    });
    expect(partialR2.success).toBe(false);

    const missingPublicUrl = serverEnvSchema.safeParse({
      ...baseEnv(),
      NODE_ENV: "production",
      RESEND_API_KEY: "resend-key",
      EMAIL_FROM: "verified@cogitoacademy.id",
      R2_ACCOUNT_ID: "account",
      R2_ACCESS_KEY_ID: "access",
      R2_SECRET_ACCESS_KEY: "secret",
      R2_BUCKET: "bucket",
    });
    expect(missingPublicUrl.success).toBe(false);
  });

  test("requires complete Google Meet credentials", () => {
    const missing = serverEnvSchema.safeParse({
      ...baseEnv(),
      GOOGLE_MEET_ENABLED: true,
    });
    expect(missing.success).toBe(false);

    const serviceAccountWithoutDelegation = serverEnvSchema.safeParse({
      ...baseEnv(),
      GOOGLE_MEET_ENABLED: true,
      GOOGLE_CLIENT_EMAIL: "service@example.com",
      GOOGLE_PRIVATE_KEY: "private-key",
    });
    expect(serviceAccountWithoutDelegation.success).toBe(false);

    const oauth = serverEnvSchema.safeParse({
      ...baseEnv(),
      GOOGLE_MEET_ENABLED: true,
      GOOGLE_MEET_CLIENT_ID: "client",
      GOOGLE_MEET_CLIENT_SECRET: "secret",
      GOOGLE_MEET_REFRESH_TOKEN: "refresh",
    });
    expect(oauth.success).toBe(true);
  });
});
