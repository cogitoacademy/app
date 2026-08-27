import { describe, test, expect } from "bun:test";
import { InMemoryRedis } from "../../lib/redis";
import {
  checkDlqHealth,
  checkSchedulerHealth,
  healthCheck,
  healthStatus,
} from "../../lib/db-health";

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

  test("reports degraded when database responds slowly (>1s)", async () => {
    const result = await healthCheck(undefined, makeDb({ ms: 1500 }));
    expect(result.checks.database).toBe("degraded");
    expect(result.status).toBe("degraded");
  });
});

describe("healthStatus (N3)", () => {
  test("ok maps to 200", () => {
    expect(healthStatus("ok")).toBe(200);
  });

  test("degraded maps to 503 (latency degradation trips readiness)", () => {
    expect(healthStatus("degraded")).toBe(503);
  });

  test("error maps to 503", () => {
    expect(healthStatus("error")).toBe(503);
  });
});

describe("checkSchedulerHealth", () => {
  test("returns ok when redis pings", async () => {
    const redis = new InMemoryRedis();
    await expect(checkSchedulerHealth(redis)).resolves.toBe("ok");
  });

  test("returns error when redis ping throws", async () => {
    const failingRedis = {
      ...new InMemoryRedis(),
      ping: async () => {
        throw new Error("connection refused");
      },
    };
    await expect(checkSchedulerHealth(failingRedis as any)).resolves.toBe(
      "error",
    );
  });

  test("returns degraded when no redis is provided", async () => {
    await expect(checkSchedulerHealth(undefined)).resolves.toBe("degraded");
  });

  test("is wired into healthCheck as checks.scheduler", async () => {
    const result = await healthCheck(new InMemoryRedis(), makeDb({ ms: 5 }));
    expect(result.checks.scheduler).toBe("ok");

    const failing = await healthCheck(
      {
        ...new InMemoryRedis(),
        ping: async () => {
          throw new Error("down");
        },
      } as any,
      makeDb({ ms: 5 }),
    );
    expect(failing.checks.scheduler).toBe("error");
    expect(failing.status).toBe("error");
  });
});

describe("checkDlqHealth", () => {
  test("returns 0 for an empty DLQ", async () => {
    const redis = new InMemoryRedis();
    await expect(checkDlqHealth(redis)).resolves.toBe(0);
  });

  test("returns the DLQ depth when jobs are queued", async () => {
    const redis = {
      ...new InMemoryRedis(),
      llen: async (key: string) => (key === "cogito:dlq" ? 3 : 0),
    };
    await expect(checkDlqHealth(redis as any)).resolves.toBe(3);
  });

  test("returns -1 when redis llen throws (unknown depth)", async () => {
    const failingRedis = {
      ...new InMemoryRedis(),
      llen: async () => {
        throw new Error("connection refused");
      },
    };
    await expect(checkDlqHealth(failingRedis as any)).resolves.toBe(-1);
  });

  test("returns 0 when no redis is provided", async () => {
    await expect(checkDlqHealth(undefined)).resolves.toBe(0);
  });

  test("is wired into healthCheck as checks.dlq + dlqDepth", async () => {
    const result = await healthCheck(new InMemoryRedis(), makeDb({ ms: 5 }));
    expect(result.checks.dlq).toBe("ok");
    expect(result.dlqDepth).toBe(0);

    // NOTE: `{ ...new InMemoryRedis() }` would LOSE the class methods (they
    // live on the prototype) — use Object.create to keep ping() etc.
    const withJobs = Object.create(InMemoryRedis.prototype);
    withJobs.llen = async () => 5;
    const dlqResult = await healthCheck(withJobs, makeDb({ ms: 5 }));
    expect(dlqResult.checks.dlq).toBe("error");
    expect(dlqResult.dlqDepth).toBe(5);
    // DLQ depth must not flip the overall status by itself — it is an
    // alerting signal, not a readiness gate.
    expect(dlqResult.status).toBe("ok");
    expect(dlqResult.checks.scheduler).toBe("ok");
  });
});
