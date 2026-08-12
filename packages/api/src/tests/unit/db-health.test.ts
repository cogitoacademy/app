import { describe, test, expect } from "bun:test";
import { InMemoryRedis } from "../../lib/redis";
import { healthCheck } from "../../lib/db-health";

function makeDb(behavior: { ok?: boolean; ms?: number } = {}) {
  const { ok = true, ms = 5 } = behavior;
  return {
    execute: async () => {
      if (!ok) throw new Error("connection refused");
      await new Promise((r) => setTimeout(r, ms));
      return [{ result: 1 }];
    },
  };
}

describe("healthCheck", () => {
  test("returns ok when database responds quickly", async () => {
    const result = await healthCheck(undefined, makeDb({ ms: 5 }));
    expect(result.checks.database).toBe("ok");
    expect(result.status).toBe("ok");
    expect(result.timestamp).toBeDefined();
  });

  test("returns error when database throws", async () => {
    const result = await healthCheck(undefined, makeDb({ ok: false }));
    expect(result.checks.database).toBe("error");
    expect(result.status).toBe("error");
  });

  test("includes redis status when redis client is provided", async () => {
    const redis = new InMemoryRedis();
    const result = await healthCheck(redis, makeDb({ ms: 5 }));
    expect(result.checks).toHaveProperty("database");
    expect(result.checks).toHaveProperty("redis");
    expect(result.checks.redis).toBe("ok");
  });

  test("reports error when redis ping fails", async () => {
    const failingRedis = {
      ...new InMemoryRedis(),
      ping: async () => {
        throw new Error("connection refused");
      },
    };
    const result = await healthCheck(failingRedis, makeDb({ ms: 5 }));
    expect(result.checks.redis).toBe("error");
  });

  test("omits redis status when no redis client provided", async () => {
    const result = await healthCheck(undefined, makeDb({ ms: 5 }));
    expect(result.checks).not.toHaveProperty("redis");
  });
});
