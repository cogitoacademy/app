import { afterEach, expect, test } from "bun:test";

import { resetE2eAuthRateLimit } from "./auth-rate-limit";

const ENV_KEYS = [
  "DATABASE_URL",
  "REDIS_URL",
  "NODE_ENV",
  "E2E_AUTH_RATE_LIMIT_RESET",
] as const;
const originalEnv = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = originalEnv.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("does nothing without explicit auth limiter reset consent", () => {
  delete process.env.E2E_AUTH_RATE_LIMIT_RESET;
  process.env.DATABASE_URL = "postgresql://remote.example/cogito-test";
  process.env.REDIS_URL = "redis://remote.example:6379";

  expect(() => resetE2eAuthRateLimit()).not.toThrow();
});

test("rejects retained development ports even with explicit consent", () => {
  process.env.E2E_AUTH_RATE_LIMIT_RESET = "true";
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL =
    "postgresql://postgres:password@localhost:6768/cogito-test";
  process.env.REDIS_URL = "redis://localhost:6380";

  expect(() => resetE2eAuthRateLimit()).toThrow(
    "exact 6769/cogito-test + 6381 or 6770/cogito-test-payout + 6382",
  );
});

test("rejects a Redis service that is not paired with the disposable database", () => {
  process.env.E2E_AUTH_RATE_LIMIT_RESET = "true";
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL =
    "postgresql://postgres:password@localhost:6769/cogito-test";
  process.env.REDIS_URL = "redis://localhost:6379";

  expect(() => resetE2eAuthRateLimit()).toThrow(
    "exact 6769/cogito-test + 6381 or 6770/cogito-test-payout + 6382",
  );
});
