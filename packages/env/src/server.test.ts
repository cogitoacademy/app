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

  test("rejects unsupported payment provider", () => {
    const result = serverEnvSchema.safeParse({
      ...baseEnv(),
      PAYMENT_PROVIDER: "legacy-provider",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.map((issue) => issue.path.join(".")),
      ).toContain("PAYMENT_PROVIDER");
    }
  });

  test("requires Midtrans credentials when selected", () => {
    const result = serverEnvSchema.safeParse({
      ...baseEnv(),
      PAYMENT_PROVIDER: "midtrans",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual(
        expect.arrayContaining([
          "MIDTRANS_SERVER_KEY",
          "MIDTRANS_CLIENT_KEY",
          "MIDTRANS_MERCHANT_ID",
          "MIDTRANS_MODE",
        ]),
      );
    }
  });

  test("accepts a complete Midtrans configuration", () => {
    const result = serverEnvSchema.safeParse({
      ...baseEnv(),
      PAYMENT_PROVIDER: "midtrans",
      MIDTRANS_SERVER_KEY: "SB-Mid-server-test",
      MIDTRANS_CLIENT_KEY: "SB-Mid-client-test",
      MIDTRANS_MERCHANT_ID: "G123456789",
      MIDTRANS_MODE: "test",
    });
    expect(result.success).toBe(true);
  });

  test("accepts a Midtrans configuration with a dedicated webhook signature key", () => {
    const result = serverEnvSchema.safeParse({
      ...baseEnv(),
      PAYMENT_PROVIDER: "midtrans",
      MIDTRANS_SERVER_KEY: "SB-Mid-server-test",
      MIDTRANS_CLIENT_KEY: "SB-Mid-client-test",
      MIDTRANS_MERCHANT_ID: "G123456789",
      MIDTRANS_MODE: "live",
      MIDTRANS_WEBHOOK_SIGNATURE_KEY: "dedicated-signature-key",
    });
    expect(result.success).toBe(true);
  });

  test("PAYMENT_PROVIDER=stub does not require Midtrans credentials", () => {
    expect(() => serverEnvSchema.parse(baseEnv())).not.toThrow();
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

  test("D3: production-like envs require SCHEDULER_ENABLED=true", () => {
    const prod = {
      ...baseEnv(),
      NODE_ENV: "production",
      RESEND_API_KEY: "resend-key",
      EMAIL_FROM: "verified@cogitoacademy.id",
    };
    const disabled = serverEnvSchema.safeParse(prod);
    expect(disabled.success).toBe(false);
    if (!disabled.success) {
      expect(
        disabled.error.issues.map((issue) => issue.path.join(".")),
      ).toContain("SCHEDULER_ENABLED");
    }

    const enabled = serverEnvSchema.safeParse({
      ...prod,
      SCHEDULER_ENABLED: true,
    });
    expect(enabled.success).toBe(true);
  });

  test("production Midtrans Sandbox requires the shared UAT email allowlist", () => {
    const prodTest = {
      ...baseEnv(),
      NODE_ENV: "production",
      RESEND_API_KEY: "resend-key",
      EMAIL_FROM: "verified@cogitoacademy.id",
      SCHEDULER_ENABLED: true,
      PAYMENT_PROVIDER: "midtrans",
      MIDTRANS_SERVER_KEY: "SB-Mid-server-test",
      MIDTRANS_CLIENT_KEY: "SB-Mid-client-test",
      MIDTRANS_MERCHANT_ID: "G123456789",
      MIDTRANS_MODE: "test",
    };
    const missing = serverEnvSchema.safeParse(prodTest);
    expect(missing.success).toBe(false);
    if (!missing.success) {
      expect(
        missing.error.issues.map((issue) => issue.path.join(".")),
      ).toContain("PAYMENT_TEST_ALLOWED_EMAILS");
    }

    const valid = serverEnvSchema.safeParse({
      ...prodTest,
      PAYMENT_TEST_ALLOWED_EMAILS:
        "qa@cogitoacademy.id, owner@cogitoacademy.id",
    });
    expect(valid.success).toBe(true);
  });

  test("production Midtrans Sandbox rejects an invalid shared UAT allowlist", () => {
    const prodTest = {
      ...baseEnv(),
      NODE_ENV: "production",
      RESEND_API_KEY: "resend-key",
      EMAIL_FROM: "verified@cogitoacademy.id",
      SCHEDULER_ENABLED: true,
      PAYMENT_PROVIDER: "midtrans",
      MIDTRANS_SERVER_KEY: "SB-Mid-server-test",
      MIDTRANS_CLIENT_KEY: "SB-Mid-client-test",
      MIDTRANS_MERCHANT_ID: "G123456789",
      MIDTRANS_MODE: "test",
    };

    const badEmail = serverEnvSchema.safeParse({
      ...prodTest,
      PAYMENT_TEST_ALLOWED_EMAILS: "qa@cogitoacademy.id, not-an-email",
    });
    expect(badEmail.success).toBe(false);
    if (!badEmail.success) {
      expect(
        badEmail.error.issues.map((issue) => issue.path.join(".")),
      ).toContain("PAYMENT_TEST_ALLOWED_EMAILS");
    }

    const emptyList = serverEnvSchema.safeParse({
      ...prodTest,
      PAYMENT_TEST_ALLOWED_EMAILS: ", ,",
    });
    expect(emptyList.success).toBe(false);
  });

  test("production Midtrans Live does not require the shared UAT allowlist", () => {
    const prodLive = {
      ...baseEnv(),
      NODE_ENV: "production",
      RESEND_API_KEY: "resend-key",
      EMAIL_FROM: "verified@cogitoacademy.id",
      SCHEDULER_ENABLED: true,
      PAYMENT_PROVIDER: "midtrans",
      MIDTRANS_SERVER_KEY: "Mid-server-live",
      MIDTRANS_CLIENT_KEY: "Mid-client-live",
      MIDTRANS_MERCHANT_ID: "G123456789",
      MIDTRANS_MODE: "live",
    };
    expect(serverEnvSchema.safeParse(prodLive).success).toBe(true);
  });
});
