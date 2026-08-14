import { describe, expect, test } from "bun:test";
import { serverEnvSchema } from "@cogito-app/env/server";

const validEnv = {
  DATABASE_URL: "postgresql://postgres:password@localhost:6767/cogito-test",
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
      }),
    ).not.toThrow();
  });

  test("PAYMENT_PROVIDER=stub does not require Xendit credentials", () => {
    expect(() => serverEnvSchema.parse(validEnv)).not.toThrow();
  });
});
