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

describe("server env boolean coercion (H1)", () => {
  const BOOL_VARS: string[] = [
    "TRUST_PROXY",
    "STUB_WEBHOOK_ALLOWED",
    "SCHEDULER_ENABLED",
    "DB_SSL_ENABLED",
    "DB_SSL_REJECT_UNAUTHORIZED",
  ];

  test.each(BOOL_VARS)(
    '%s="false" parses to boolean false (not truthy)',
    (v: string) => {
      const parsed = serverEnvSchema.safeParse({ ...validEnv, [v]: "false" });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect((parsed.data as Record<string, unknown>)[v]).toBe(false);
      }
    },
  );

  test.each(BOOL_VARS)('%s="0" parses to boolean false', (v: string) => {
    const parsed = serverEnvSchema.safeParse({ ...validEnv, [v]: "0" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect((parsed.data as Record<string, unknown>)[v]).toBe(false);
    }
  });

  test.each(BOOL_VARS)('%s="true" parses to boolean true', (v: string) => {
    const parsed = serverEnvSchema.safeParse({ ...validEnv, [v]: "true" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect((parsed.data as Record<string, unknown>)[v]).toBe(true);
    }
  });

  test.each(BOOL_VARS)('%s="" falls back to the default', (v: string) => {
    // emptyStringAsUndefined means an empty string is treated as undefined,
    // so the default applies.
    const parsed = serverEnvSchema.safeParse({ ...validEnv, [v]: "" });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      if (v === "DB_SSL_ENABLED" || v === "DB_SSL_REJECT_UNAUTHORIZED") {
        expect((parsed.data as Record<string, unknown>)[v]).toBe(true); // default true
      } else {
        expect((parsed.data as Record<string, unknown>)[v]).toBe(false); // default false
      }
    }
  });

  test('TRUST_PROXY="FALSE" (uppercase) parses to false', () => {
    const parsed = serverEnvSchema.safeParse({
      ...validEnv,
      TRUST_PROXY: "FALSE",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect((parsed.data as Record<string, unknown>).TRUST_PROXY).toBe(false);
    }
  });
});
