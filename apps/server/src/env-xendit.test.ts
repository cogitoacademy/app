import { describe, expect, test } from "bun:test";
import { serverEnvSchema } from "@cogito-app/env/server";

const validEnv = {
  DATABASE_URL: "postgresql://postgres:password@localhost:6767/cogito-test",
  REDIS_URL: "redis://localhost:6379",
  BETTER_AUTH_SECRET: "a-secret-that-is-at-least-32-characters-long",
  BETTER_AUTH_URL: "http://localhost:3001",
  CORS_ORIGIN: "http://localhost:3000",
  NODE_ENV: "development",
  PAYMENT_PROVIDER: "stub",
  PAYMENT_WEBHOOK_SECRET: "a-payment-webhook-secret-at-least-32-chars",
};

describe("server env schema", () => {
  test("PAYMENT_PROVIDER=xendit requires Xendit credentials", () => {
    const base = { ...validEnv, PAYMENT_PROVIDER: "xendit" };
    expect(() => serverEnvSchema.parse(base)).toThrow();
    expect(() =>
      serverEnvSchema.parse({
        ...base,
        XENDIT_SECRET_KEY: "sk",
        XENDIT_WEBHOOK_TOKEN: "wh",
        XENDIT_MODE: "test",
      }),
    ).toThrow();
  });

  test("P3.7: PAYMENT_PROVIDER=xendit requires success/failure redirect URLs", () => {
    const base = {
      ...validEnv,
      PAYMENT_PROVIDER: "xendit",
      XENDIT_SECRET_KEY: "sk",
      XENDIT_WEBHOOK_TOKEN: "wh",
      XENDIT_MODE: "test",
    };
    const err = serverEnvSchema.safeParse(base);
    expect(err.success).toBe(false);
    const paths = (err.error?.issues ?? []).map((i) => i.path.join("."));
    expect(paths).toContain("XENDIT_SUCCESS_REDIRECT_URL");
    expect(paths).toContain("XENDIT_FAILURE_REDIRECT_URL");
    expect(() =>
      serverEnvSchema.parse({
        ...base,
        XENDIT_MODE: "test",
        XENDIT_SUCCESS_REDIRECT_URL: "https://example.com/success",
        XENDIT_FAILURE_REDIRECT_URL: "https://example.com/failure",
      }),
    ).not.toThrow();
  });

  test("PAYMENT_PROVIDER=stub does not require Xendit credentials", () => {
    expect(() => serverEnvSchema.parse(validEnv)).not.toThrow();
  });

  test("PAYMENT_PROVIDER=midtrans requires Midtrans credentials", () => {
    const base = { ...validEnv, PAYMENT_PROVIDER: "midtrans" };
    expect(() => serverEnvSchema.parse(base)).toThrow();
    expect(() =>
      serverEnvSchema.parse({
        ...base,
        MIDTRANS_SERVER_KEY: "SB-Mid-server-test",
        MIDTRANS_CLIENT_KEY: "SB-Mid-client-test",
        MIDTRANS_MERCHANT_ID: "G123456789",
        MIDTRANS_MODE: "test",
      }),
    ).not.toThrow();
  });

  test("PAYMENT_PROVIDER=midtrans rejects a partial credential set", () => {
    const base = { ...validEnv, PAYMENT_PROVIDER: "midtrans" };
    const err = serverEnvSchema.safeParse({
      ...base,
      MIDTRANS_SERVER_KEY: "SB-Mid-server-test",
    });
    expect(err.success).toBe(false);
    const paths = (err.error?.issues ?? []).map((i) => i.path.join("."));
    expect(paths).toContain("MIDTRANS_CLIENT_KEY");
    expect(paths).toContain("MIDTRANS_MERCHANT_ID");
    expect(paths).toContain("MIDTRANS_MODE");
  });

  test("P4.1: NODE_ENV=production requires RESEND_API_KEY and a non-default EMAIL_FROM", () => {
    const prod = {
      ...validEnv,
      NODE_ENV: "production",
      SCHEDULER_ENABLED: true,
    };
    const missingKey = serverEnvSchema.safeParse(prod);
    expect(missingKey.success).toBe(false);
    const paths = (missingKey.error?.issues ?? []).map((i) => i.path.join("."));
    expect(paths).toContain("RESEND_API_KEY");

    // EMAIL_FROM must not be the dev default in production.
    const defaultFrom = serverEnvSchema.safeParse({
      ...prod,
      RESEND_API_KEY: "re_prod_key",
    });
    expect(defaultFrom.success).toBe(false);
    const fromPaths = (defaultFrom.error?.issues ?? []).map((i) =>
      i.path.join("."),
    );
    expect(fromPaths).toContain("EMAIL_FROM");

    // A complete production set parses (verified non-default sender).
    expect(() =>
      serverEnvSchema.parse({
        ...prod,
        RESEND_API_KEY: "re_prod_key",
        EMAIL_FROM: "no-reply@cogitoacademy.id",
      }),
    ).not.toThrow();
  });

  test("NODE_ENV=staging is accepted and behaves like production (P4.1/P4.3)", () => {
    // Staging without the Resend key is rejected (fail-loud, like production).
    const staging = {
      ...validEnv,
      NODE_ENV: "staging",
      SCHEDULER_ENABLED: true,
    };
    const missingKey = serverEnvSchema.safeParse(staging);
    expect(missingKey.success).toBe(false);
    const paths = (missingKey.error?.issues ?? []).map((i) => i.path.join("."));
    expect(paths).toContain("RESEND_API_KEY");

    // Staging with the key + non-default sender parses.
    const stagingOk = serverEnvSchema.safeParse({
      ...staging,
      RESEND_API_KEY: "re_staging_key",
      EMAIL_FROM: "no-reply@staging.cogitoacademy.id",
    });
    expect(stagingOk.success).toBe(true);

    // Partial R2 config is rejected in staging, like production.
    const partialR2 = serverEnvSchema.safeParse({
      ...staging,
      RESEND_API_KEY: "re_staging_key",
      EMAIL_FROM: "no-reply@staging.cogitoacademy.id",
      R2_ACCOUNT_ID: "acct",
    });
    expect(partialR2.success).toBe(false);
  });

  test("P4.2: GOOGLE_MEET_ENABLED=true requires a complete credential set", () => {
    // Partial OAuth triple → rejected.
    const partial = serverEnvSchema.safeParse({
      ...validEnv,
      GOOGLE_MEET_ENABLED: true,
      GOOGLE_MEET_CLIENT_ID: "cid",
    });
    expect(partial.success).toBe(false);
    const paths = (partial.error?.issues ?? []).map((i) => i.path.join("."));
    expect(paths).toContain("GOOGLE_MEET_ENABLED");

    // Complete OAuth triple → ok.
    expect(() =>
      serverEnvSchema.parse({
        ...validEnv,
        GOOGLE_MEET_ENABLED: true,
        GOOGLE_MEET_CLIENT_ID: "cid",
        GOOGLE_MEET_CLIENT_SECRET: "csec",
        GOOGLE_MEET_REFRESH_TOKEN: "rtok",
      }),
    ).not.toThrow();
  });

  test("P4.2: service-account mode requires GOOGLE_IMPERSONATED_USER", () => {
    // SA email+key without impersonation → rejected.
    const noImpersonation = serverEnvSchema.safeParse({
      ...validEnv,
      GOOGLE_MEET_ENABLED: true,
      GOOGLE_CLIENT_EMAIL: "sa@example.com",
      GOOGLE_PRIVATE_KEY:
        "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----",
    });
    expect(noImpersonation.success).toBe(false);
    const paths = (noImpersonation.error?.issues ?? []).map((i) =>
      i.path.join("."),
    );
    expect(paths).toContain("GOOGLE_IMPERSONATED_USER");

    // SA email+key + impersonated user → ok.
    expect(() =>
      serverEnvSchema.parse({
        ...validEnv,
        GOOGLE_MEET_ENABLED: true,
        GOOGLE_CLIENT_EMAIL: "sa@example.com",
        GOOGLE_PRIVATE_KEY:
          "-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----",
        GOOGLE_IMPERSONATED_USER: "user@cogitoacademy.id",
      }),
    ).not.toThrow();
  });

  test("P4.3: production with partial R2 config is rejected", () => {
    const prod = {
      ...validEnv,
      NODE_ENV: "production",
      SCHEDULER_ENABLED: true,
      RESEND_API_KEY: "re",
      EMAIL_FROM: "no-reply@cogitoacademy.id",
    };
    const partial = serverEnvSchema.safeParse({
      ...prod,
      R2_ACCOUNT_ID: "acct",
    });
    expect(partial.success).toBe(false);
    const paths = (partial.error?.issues ?? []).map((i) => i.path.join("."));
    expect(paths).toContain("R2_ACCOUNT_ID");
  });

  test("P4.3: production with complete R2 but no R2_PUBLIC_URL is rejected", () => {
    const prod = {
      ...validEnv,
      NODE_ENV: "production",
      SCHEDULER_ENABLED: true,
      RESEND_API_KEY: "re",
      EMAIL_FROM: "no-reply@cogitoacademy.id",
    };
    const noUrl = serverEnvSchema.safeParse({
      ...prod,
      R2_ACCOUNT_ID: "acct",
      R2_ACCESS_KEY_ID: "key",
      R2_SECRET_ACCESS_KEY: "sec",
      R2_BUCKET: "bucket",
    });
    expect(noUrl.success).toBe(false);
    const paths = (noUrl.error?.issues ?? []).map((i) => i.path.join("."));
    expect(paths).toContain("R2_PUBLIC_URL");
  });

  test("P4.3: complete R2 config with R2_PUBLIC_URL parses", () => {
    const prod = {
      ...validEnv,
      NODE_ENV: "production",
      SCHEDULER_ENABLED: true,
      RESEND_API_KEY: "re",
      EMAIL_FROM: "no-reply@cogitoacademy.id",
    };
    expect(() =>
      serverEnvSchema.parse({
        ...prod,
        R2_ACCOUNT_ID: "acct",
        R2_ACCESS_KEY_ID: "key",
        R2_SECRET_ACCESS_KEY: "sec",
        R2_BUCKET: "bucket",
        R2_PUBLIC_URL: "https://media.cogitoacademy.id",
      }),
    ).not.toThrow();
  });

  test("GOOGLE_MEET_ENABLED=false string is coerced to boolean false (not truthy)", () => {
    // z.coerce.boolean() would turn the string "false" into true — the
    // explicit preprocess keeps the documented test invocation safe.
    const parsed = serverEnvSchema.safeParse({
      ...validEnv,
      GOOGLE_MEET_ENABLED: "false",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.GOOGLE_MEET_ENABLED).toBe(false);
    }
  });

  test("D2: xendit in production does NOT require WEBHOOK_ALLOWED_IPS (optional defense-in-depth, 2026-08-28)", () => {
    const prodXendit = {
      ...validEnv,
      NODE_ENV: "production",
      RESEND_API_KEY: "re",
      EMAIL_FROM: "no-reply@cogitoacademy.id",
      SCHEDULER_ENABLED: true,
      PAYMENT_PROVIDER: "xendit",
      XENDIT_SECRET_KEY: "sk",
      XENDIT_WEBHOOK_TOKEN: "wh",
      XENDIT_MODE: "live",
      XENDIT_SUCCESS_REDIRECT_URL: "https://example.com/success",
      XENDIT_FAILURE_REDIRECT_URL: "https://example.com/failure",
    };

    // D2 removed (2026-08-28): Xendit publishes no stable webhook source IP
    // list, so a wrong allowlist silently 403s webhooks and payments never
    // credit — the x-callback-token signature is the primary gate. Empty
    // allowlist = signature-only gating, and boot must succeed.
    const missing = serverEnvSchema.safeParse(prodXendit);
    expect(missing.success).toBe(true);

    // With the allowlist set (defense-in-depth) → still parses.
    expect(() =>
      serverEnvSchema.parse({
        ...prodXendit,
        WEBHOOK_ALLOWED_IPS: "103.10.65.0/24, 114.4.17.0/24",
      }),
    ).not.toThrow();
  });

  test("D2: xendit in development does not require WEBHOOK_ALLOWED_IPS", () => {
    const devXendit = {
      ...validEnv,
      PAYMENT_PROVIDER: "xendit",
      XENDIT_SECRET_KEY: "sk",
      XENDIT_WEBHOOK_TOKEN: "wh",
      XENDIT_MODE: "test",
      XENDIT_SUCCESS_REDIRECT_URL: "https://example.com/success",
      XENDIT_FAILURE_REDIRECT_URL: "https://example.com/failure",
    };
    expect(() => serverEnvSchema.parse(devXendit)).not.toThrow();
  });

  test("production Xendit Test Mode requires a UAT email allowlist", () => {
    const prodTest = {
      ...validEnv,
      NODE_ENV: "production",
      RESEND_API_KEY: "re",
      EMAIL_FROM: "no-reply@cogitoacademy.id",
      SCHEDULER_ENABLED: true,
      PAYMENT_PROVIDER: "xendit",
      XENDIT_SECRET_KEY: "sk",
      XENDIT_WEBHOOK_TOKEN: "wh",
      XENDIT_MODE: "test",
      XENDIT_SUCCESS_REDIRECT_URL: "https://example.com/success",
      XENDIT_FAILURE_REDIRECT_URL: "https://example.com/failure",
      WEBHOOK_ALLOWED_IPS: "103.10.65.0/24",
    };
    const missing = serverEnvSchema.safeParse(prodTest);
    expect(missing.success).toBe(false);
    const paths = (missing.error?.issues ?? []).map((i) => i.path.join("."));
    expect(paths).toContain("XENDIT_TEST_ALLOWED_EMAILS");

    expect(() =>
      serverEnvSchema.parse({
        ...prodTest,
        XENDIT_TEST_ALLOWED_EMAILS: "qa@cogitoacademy.id",
      }),
    ).not.toThrow();
  });

  test("D3: production requires SCHEDULER_ENABLED=true (silently skipping all jobs is a prod outage)", () => {
    const prod = {
      ...validEnv,
      NODE_ENV: "production",
      RESEND_API_KEY: "re",
      EMAIL_FROM: "no-reply@cogitoacademy.id",
      PAYMENT_PROVIDER: "stub",
    };
    const disabled = serverEnvSchema.safeParse(prod);
    expect(disabled.success).toBe(false);
    const paths = (disabled.error?.issues ?? []).map((i) => i.path.join("."));
    expect(paths).toContain("SCHEDULER_ENABLED");

    expect(() =>
      serverEnvSchema.parse({ ...prod, SCHEDULER_ENABLED: true }),
    ).not.toThrow();
  });

  test("D3: staging behaves like production for SCHEDULER_ENABLED", () => {
    const staging = {
      ...validEnv,
      NODE_ENV: "staging",
      RESEND_API_KEY: "re_staging_key",
      EMAIL_FROM: "no-reply@staging.cogitoacademy.id",
      PAYMENT_PROVIDER: "stub",
    };
    expect(staging && serverEnvSchema.safeParse(staging).success).toBe(false);
    expect(() =>
      serverEnvSchema.parse({ ...staging, SCHEDULER_ENABLED: true }),
    ).not.toThrow();
  });
});
