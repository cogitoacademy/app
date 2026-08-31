import { describe, test, expect } from "bun:test";
import { InMemoryRedis, createRedisAdapter } from "../../lib/redis";
import {
  DLQ_FRESH_WINDOW_MS,
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

// eval-based fake Redis: the Lua-side freshness logic is approximated by
// running the same filter over the fake list at the cutoff the real script
// receives. The script itself is exercised in the Lua-path tests (script/
// argv capture and error propagation).
function makeEvalRedis(entries: unknown[]) {
  return {
    ping: async () => "PONG",
    llen: async () => entries.length,
    eval: async (
      _script: string,
      _keys: string[],
      args: (string | number)[],
    ) => {
      const cutoff = Number(args[0]);
      return entries.filter((entry) => {
        const failedAt =
          typeof entry === "object" && entry !== null && "failedAt" in entry
            ? (entry as { failedAt?: unknown }).failedAt
            : undefined;
        return typeof failedAt === "number" && failedAt > cutoff;
      }).length;
    },
  };
}

describe("checkDlqHealth", () => {
  test.each(["cogito:dlq", "custom:dlq"])(
    "counts only fresh entries within the 24h window (key %s)",
    async (key) => {
      const now = Date.now();
      const redis = makeEvalRedis([
        { failedAt: now - 1000, failedReason: "fresh" },
        { failedAt: now - 23 * 3600 * 1000, failedReason: "fresh-earlier" },
        { failedAt: now - 25 * 3600 * 1000, failedReason: "stale" },
        { failedAt: now - 48 * 3600 * 1000 },
        { failedReason: "no timestamp — pre-2026-08-31 ledger" },
        "not-json-at-all",
      ]);
      await expect(checkDlqHealth(redis as any, key)).resolves.toBe(2);
    },
  );

  test("excludes entries older than the window (>24h) as a stale ledger", async () => {
    const now = Date.now();
    const redis = makeEvalRedis(
      Array.from({ length: 100 }, (_, i) => ({
        failedReason: `stale-${i}`,
        // The live 2026-08-25 batch sits far outside the window.
        failedAt: now - (25 + i) * 3600 * 1000,
      })),
    );
    // 100 stale ledger entries must NOT trip the alert forever.
    await expect(checkDlqHealth(redis as any)).resolves.toBe(0);
  });

  test("excludes entries without failedAt (never count toward fresh depth)", async () => {
    const redis = makeEvalRedis([
      { originalJobId: "job-1", failedReason: "boom" },
      { originalJobId: "job-2", failedAt: Date.now() - 1000 },
      { originalJobId: "job-3", failedAt: null },
    ]);
    await expect(checkDlqHealth(redis as any)).resolves.toBe(1);
  });

  test("returns 0 for an empty DLQ", async () => {
    const redis = makeEvalRedis([]);
    await expect(checkDlqHealth(redis as any)).resolves.toBe(0);
  });

  test("boundary: an entry exactly at the 24h edge counts as STALE (strict >)", async () => {
    const now = Date.now();
    const redis = makeEvalRedis([
      { failedAt: now - DLQ_FRESH_WINDOW_MS }, // exactly at the edge
      { failedAt: now - DLQ_FRESH_WINDOW_MS + 1 }, // 1ms fresher
      { failedAt: now - DLQ_FRESH_WINDOW_MS - 1 }, // 1ms staler
    ]);
    // Documented boundary: failedAt == cutoff (exactly 24h old) is stale;
    // only entries strictly inside the window are fresh.
    await expect(checkDlqHealth(redis as any)).resolves.toBe(1);
  });

  test("env override DLQ_FRESH_WINDOW_HOURS widens the window", async () => {
    const now = Date.now();
    const redis = makeEvalRedis([
      { failedAt: now - 30 * 3600 * 1000 }, // stale at 24h, fresh at 48h
      { failedAt: now - 50 * 3600 * 1000 }, // stale even at 48h
    ]);
    const previous = process.env.DLQ_FRESH_WINDOW_HOURS;
    try {
      process.env.DLQ_FRESH_WINDOW_HOURS = "48";
      await expect(checkDlqHealth(redis as any)).resolves.toBe(1);
    } finally {
      if (previous === undefined) delete process.env.DLQ_FRESH_WINDOW_HOURS;
      else process.env.DLQ_FRESH_WINDOW_HOURS = previous;
    }
  });

  test.each(["not-a-number", "-4", "0", "99999"])(
    "invalid env override %s falls back to the 24h default",
    async (invalid) => {
      const now = Date.now();
      const redis = makeEvalRedis([
        { failedAt: now - 12 * 3600 * 1000 }, // fresh regardless
        { failedAt: now - 30 * 3600 * 1000 }, // stale at the default window
      ]);
      const previous = process.env.DLQ_FRESH_WINDOW_HOURS;
      try {
        process.env.DLQ_FRESH_WINDOW_HOURS = invalid;
        // 99999 exceeds the one-year sanity cap, so 30h stays stale; the
        // remaining values fall back to 24h the same way.
        await expect(checkDlqHealth(redis as any)).resolves.toBe(1);
      } finally {
        if (previous === undefined) delete process.env.DLQ_FRESH_WINDOW_HOURS;
        else process.env.DLQ_FRESH_WINDOW_HOURS = previous;
      }
    },
  );

  test("blank env override uses the 24h default", async () => {
    const now = Date.now();
    const redis = makeEvalRedis([{ failedAt: now - 23 * 3600 * 1000 }]);
    const previous = process.env.DLQ_FRESH_WINDOW_HOURS;
    try {
      process.env.DLQ_FRESH_WINDOW_HOURS = "  ";
      await expect(checkDlqHealth(redis as any)).resolves.toBe(1);
    } finally {
      if (previous === undefined) delete process.env.DLQ_FRESH_WINDOW_HOURS;
      else process.env.DLQ_FRESH_WINDOW_HOURS = previous;
    }
  });

  test("sends a bounded Lua scan with the cutoff as ARGV[1] (Lua path)", async () => {
    const calls: { script: string; keys: string[]; args: string[] }[] = [];
    const redis = {
      ping: async () => "PONG",
      eval: async (
        script: string,
        keys: string[],
        args: (string | number)[],
      ) => {
        calls.push({
          script,
          keys,
          args: args.map((a) => String(a)),
        });
        return 0;
      },
    };
    await expect(checkDlqHealth(redis as any)).resolves.toBe(0);
    expect(calls.length).toBe(1);
    expect(calls[0].keys).toEqual(["cogito:dlq"]);
    expect(Number(calls[0].args[0])).toBeLessThanOrEqual(
      Date.now() - DLQ_FRESH_WINDOW_MS,
    );
    // Bounded scan: the list is LTRIM-bounded to 100 entries, and the Lua
    // side caps the read independently (never walks an unbounded list).
    expect(calls[0].args[1]).toBe("100");
    expect(calls[0].script).toContain("LRANGE");
    expect(calls[0].script).toContain("failedAt");
  });

  test("returns -1 when the Lua depth evaluation throws (unknown depth)", async () => {
    const failingRedis = {
      ...new InMemoryRedis(),
      llen: async () => {
        throw new Error("connection refused");
      },
      eval: async () => {
        throw new Error("connection refused");
      },
    };
    await expect(checkDlqHealth(failingRedis as any)).resolves.toBe(-1);
  });

  test("returns -1 when the redis-backed fresh-depth resolution throws", async () => {
    const failingRedis = {
      ping: async () => "PONG",
      eval: async () => {
        throw new Error("connection refused");
      },
    };
    await expect(checkDlqHealth(failingRedis as any)).resolves.toBe(-1);
  });

  test("returns 0 when no redis is provided", async () => {
    await expect(checkDlqHealth(undefined)).resolves.toBe(0);
  });

  test("returns 0 on the in-memory fallback Redis (no lists, eval unsupported)", async () => {
    const redis = new InMemoryRedis();
    await expect(checkDlqHealth(redis)).resolves.toBe(0);
    await expect(redis.eval("script", [], [])).rejects.toThrow(
      "EVAL not supported in in-memory fallback",
    );
  });

  test("InMemoryRedis.llen reports an empty DLQ (fallback has no lists)", async () => {
    const redis = new InMemoryRedis();
    await expect(redis.llen("cogito:dlq")).resolves.toBe(0);
  });

  test("createRedisAdapter forwards llen to the underlying client", async () => {
    const calls: string[] = [];
    const adapter = createRedisAdapter({
      ping: async () => "PONG",
      get: async () => null,
      set: async () => "OK",
      del: async () => 0,
      expire: async () => 1,
      incr: async () => 1,
      hset: async () => 1,
      hget: async () => null,
      hgetall: async () => ({}),
      hdel: async () => 0,
      llen: async (key: string) => {
        calls.push(key);
        return 7;
      },
      eval: async () => null,
      quit: async () => "OK",
    });
    await expect(adapter.llen("cogito:dlq")).resolves.toBe(7);
    expect(calls).toEqual(["cogito:dlq"]);
  });

  test("is wired into healthCheck as checks.dlq + dlqDepth", async () => {
    const result = await healthCheck(new InMemoryRedis(), makeDb({ ms: 5 }));
    expect(result.checks.dlq).toBe("ok");
    expect(result.dlqDepth).toBe(0);

    // NOTE: `{ ...new InMemoryRedis() }` would LOSE the class methods (they
    // live on the prototype), and an Object.create(InMemoryRedis.prototype)
    // instance would take the in-memory short-circuit (fresh depth 0) —
    // use a plain object standing in for a real Redis-backed client.
    const withJobs = {
      ping: async () => "PONG",
      eval: async () => 5,
    };
    const dlqResult = await healthCheck(withJobs as any, makeDb({ ms: 5 }));
    expect(dlqResult.checks.dlq).toBe("error");
    expect(dlqResult.dlqDepth).toBe(5);
    // DLQ depth must not flip the overall status by itself — it is an
    // alerting signal, not a readiness gate.
    expect(dlqResult.status).toBe("ok");
    expect(dlqResult.checks.scheduler).toBe("ok");
  });
});
