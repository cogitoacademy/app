import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { db } from "@cogito-app/db";
import { markPackage } from "@cogito-app/db/schema";
import { seedAllowed, seedAdminPassword } from "./seed";
import { PACKAGES, seedPackages, seedPackagesAllowed } from "./seed-packages";

describe("seed guards", () => {
  test("seedAllowed is false in production without explicit flag", () => {
    expect(seedAllowed("production", undefined)).toBe(false);
    expect(seedAllowed("production", "true")).toBe(true);
    expect(seedAllowed("development", undefined)).toBe(true);
  });

  test("seedAllowed treats staging like production", () => {
    expect(seedAllowed("staging", undefined)).toBe(false);
    expect(seedAllowed("staging", "true")).toBe(true);
  });

  test("seedPackagesAllowed protects the standalone package seed", () => {
    expect(seedPackagesAllowed("production", undefined)).toBe(false);
    expect(seedPackagesAllowed("staging", undefined)).toBe(false);
    expect(seedPackagesAllowed("production", "true")).toBe(true);
    expect(seedPackagesAllowed("development", undefined)).toBe(true);
  });

  test("seedAdminPassword rejects short or missing passwords", () => {
    expect(seedAdminPassword(undefined)).toBeNull();
    expect(seedAdminPassword("short")).toBeNull();
    expect(seedAdminPassword("a-strong-12-char-pw")).toBe(
      "a-strong-12-char-pw",
    );
  });

  test("W2: seed-packages exits non-zero in production without SEED_ALLOWED_IN_PROD", () => {
    const prodEnv: Record<string, string> = {
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://postgres:password@localhost:6767/cogito-test",
      REDIS_URL: "redis://localhost:6379",
      BETTER_AUTH_SECRET: "test-secret-at-least-32-characters-long-1234",
      BETTER_AUTH_URL: "http://localhost:3101",
      CORS_ORIGIN: "http://localhost:3100",
      PAYMENT_PROVIDER: "stub",
      PAYMENT_WEBHOOK_SECRET: "test-payment-webhook-secret-1234567890",
      RESEND_API_KEY: "re_test_key",
      EMAIL_FROM: "no-reply@cogitoacademy.id",
      SCHEDULER_ENABLED: "true",
      DB_SSL_ENABLED: "false",
    };

    const blocked = spawnSync("bun", ["src/seed-packages.ts"], {
      cwd: new URL("..", import.meta.url).pathname,
      env: { ...process.env, ...prodEnv },
      encoding: "utf8",
    });
    expect(blocked.status).not.toBe(0);
    expect(blocked.stderr).toContain("SEED_ALLOWED_IN_PROD");

    // The allowed path must not depend on a live DB (CI has no Postgres at
    // 6767) — assert the guard decision directly instead of spawning.
    expect(seedAllowed("production", "true")).toBe(true);
    expect(seedAllowed("production", undefined)).toBe(false);
    expect(seedAllowed("development", undefined)).toBe(true);
  });
});

describe("seed package prices (PRD OQ-01)", () => {
  const PRD_PACKAGES = [
    { code: "starter", marks: 50, priceIdr: 312500 },
    { code: "learner", marks: 120, priceIdr: 690000 },
    { code: "explorer", marks: 200, priceIdr: 1070000 },
    { code: "pioneer", marks: 400, priceIdr: 2000000 },
  ];

  test("PACKAGES table matches PRD OQ-01 values", () => {
    const byCode = new Map(PACKAGES.map((p) => [p.code, p]));
    for (const expected of PRD_PACKAGES) {
      expect(byCode.get(expected.code)).toMatchObject({
        marks: expected.marks,
        priceIdr: expected.priceIdr,
      });
    }
  });

  test("seeded markPackage rows match PRD OQ-01 values", async () => {
    await db.delete(markPackage);
    await seedPackages();
    const rows = await db.select().from(markPackage);
    const byCode = new Map(rows.map((r) => [r.code, r]));
    for (const expected of PRD_PACKAGES) {
      expect(byCode.get(expected.code)).toMatchObject({
        marks: expected.marks,
        priceIdr: expected.priceIdr,
      });
    }
  });
});
