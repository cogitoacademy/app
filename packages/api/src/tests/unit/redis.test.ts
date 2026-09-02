import { describe, test, expect, beforeEach } from "bun:test";
import {
  InMemoryRedis,
  COGITO_NS,
  logRedisConnectionError,
  redisRetryStrategy,
} from "../../lib/redis";

describe("InMemoryRedis", () => {
  let redis: InMemoryRedis;

  beforeEach(() => {
    redis = new InMemoryRedis();
  });

  describe("get/set", () => {
    test("set and get a value", async () => {
      await redis.set("key1", "value1");
      expect(await redis.get("key1")).toBe("value1");
    });

    test("returns null for non-existent key", async () => {
      expect(await redis.get("nonexistent")).toBeNull();
    });

    test("set with EX sets TTL", async () => {
      await redis.set("ttlkey", "val", { type: "EX", value: 1 });
      expect(await redis.get("ttlkey")).toBe("val");
    });

    test("set with NX only sets if key does not exist", async () => {
      expect(await redis.set("nxkey", "first", { type: "NX" })).toBe("OK");
      expect(await redis.set("nxkey", "second", { type: "NX" })).toBeNull();
      expect(await redis.get("nxkey")).toBe("first");
    });

    test("set with XX only sets if key exists", async () => {
      expect(await redis.set("xxkey", "first", { type: "XX" })).toBeNull();
      await redis.set("xxkey", "first");
      expect(await redis.set("xxkey", "second", { type: "XX" })).toBe("OK");
      expect(await redis.get("xxkey")).toBe("second");
    });
  });

  describe("del", () => {
    test("deletes an existing key", async () => {
      await redis.set("delkey", "val");
      expect(await redis.del("delkey")).toBe(1);
      expect(await redis.get("delkey")).toBeNull();
    });

    test("returns 0 for non-existent key", async () => {
      expect(await redis.del("nonexistent")).toBe(0);
    });
  });

  describe("exists", () => {
    test("returns 1 for existing key", async () => {
      await redis.set("exkey", "val");
      expect(await redis.exists("exkey")).toBe(1);
    });

    test("returns 0 for non-existent key", async () => {
      expect(await redis.exists("nonexistent")).toBe(0);
    });
  });

  describe("incr", () => {
    test("increments from 0", async () => {
      expect(await redis.incr("counter")).toBe(1);
    });

    test("increments existing value", async () => {
      await redis.set("counter", "5");
      expect(await redis.incr("counter")).toBe(6);
    });
  });

  describe("expire/pttl", () => {
    test("expire sets TTL in seconds", async () => {
      await redis.set("expkey", "val");
      expect(await redis.expire("expkey", 60)).toBe(1);
      const pttl = await redis.pttl("expkey");
      expect(pttl).toBeGreaterThan(55000);
      expect(pttl).toBeLessThanOrEqual(60000);
    });

    test("expire returns 0 for non-existent key", async () => {
      expect(await redis.expire("nonexistent", 60)).toBe(0);
    });

    test("ttl returns -1 for key with no expiry", async () => {
      await redis.set("noexp", "val");
      expect(await redis.ttl("noexp")).toBe(-1);
    });

    test("ttl returns -2 for non-existent key", async () => {
      expect(await redis.ttl("nonexistent")).toBe(-2);
    });
  });

  describe("pexpire", () => {
    test("pexpire sets TTL in milliseconds", async () => {
      await redis.set("pkey", "val");
      expect(await redis.pexpire("pkey", 60000)).toBe(1);
      const pttl = await redis.pttl("pkey");
      expect(pttl).toBeGreaterThan(55000);
      expect(pttl).toBeLessThanOrEqual(60000);
    });
  });

  describe("hash operations", () => {
    test("hset/hget/hgetall", async () => {
      await redis.hset("hash1", ["field1", "val1"], ["field2", "val2"]);
      expect(await redis.hget("hash1", "field1")).toBe("val1");
      expect(await redis.hget("hash1", "field2")).toBe("val2");
      expect(await redis.hget("hash1", "nonexistent")).toBeNull();

      const all = await redis.hgetall("hash1");
      expect(all).toEqual({ field1: "val1", field2: "val2" });
    });

    test("hdel removes fields", async () => {
      await redis.hset("hash2", ["f1", "v1"], ["f2", "v2"]);
      expect(await redis.hdel("hash2", "f1")).toBe(1);
      expect(await redis.hget("hash2", "f1")).toBeNull();
    });

    test("hgetall returns empty for non-existent key", async () => {
      expect(await redis.hgetall("nonexistent")).toEqual({});
    });
  });

  describe("ping/quit", () => {
    test("ping returns PONG", async () => {
      expect(await redis.ping()).toBe("PONG");
    });

    test("quit returns OK", async () => {
      expect(await redis.quit()).toBe("OK");
    });
  });

  describe("eval", () => {
    test("throws not supported error", async () => {
      try {
        await redis.eval("", [], []);
        expect(true).toBe(false);
      } catch (error) {
        expect((error as Error).message).toContain("not supported");
      }
    });
  });

  describe("expiry", () => {
    test("expired keys return null on get", async () => {
      const originalNow = Date.now;
      let now = 1000000;
      Date.now = () => now;

      try {
        await redis.set("expkey", "val", { type: "PX", value: 100 });
        expect(await redis.get("expkey")).toBe("val");

        now = 1000200;
        expect(await redis.get("expkey")).toBeNull();
      } finally {
        Date.now = originalNow;
      }
    });

    test("expired keys not found by exists", async () => {
      const originalNow = Date.now;
      let now = 1000000;
      Date.now = () => now;

      try {
        await redis.set("expkey", "val", { type: "PX", value: 100 });
        expect(await redis.exists("expkey")).toBe(1);

        now = 1000200;
        expect(await redis.exists("expkey")).toBe(0);
      } finally {
        Date.now = originalNow;
      }
    });
  });
});

describe("COGITO_NS", () => {
  test("has expected namespace keys", () => {
    expect(COGITO_NS.IDEMPOTENCY).toBe("cogito:idem");
    expect(COGITO_NS.RATE_LIMIT).toBe("cogito:rl");
    expect(COGITO_NS.CIRCUIT_BREAKER).toBe("cogito:cb");
    expect(COGITO_NS.SESSION).toBe("cogito:sess");
  });
});

describe("Redis client helpers", () => {
  test("getRedisClient lazily returns a shared fallback client", async () => {
    const fresh = await import("../../lib/redis.ts?get-client-fresh");
    const first = fresh.getRedisClient();
    expect(first).toBe(fresh.getRedisClient());
    expect(first).toBeInstanceOf(fresh.InMemoryRedis);
  });

  test("initRedis uses a shared in-memory fallback when no URL is configured", async () => {
    const fresh = await import("../../lib/redis.ts?init-fallback-fresh");
    const first = fresh.initRedis();
    expect(first).toBe(fresh.initRedis());
    expect(first).toBeInstanceOf(fresh.InMemoryRedis);
  });

  test("retry strategy caps retries and eventually stops", () => {
    expect(redisRetryStrategy(3)).toBe(600);
    expect(redisRetryStrategy(11)).toBeNull();
  });

  test("connection errors are logged without throwing", () => {
    expect(() =>
      logRedisConnectionError(new Error("connection failed")),
    ).not.toThrow();
  });

  test("exercises every in-memory Redis command on a fresh module instance", async () => {
    const fresh = await import("../../lib/redis.ts?memory-methods-fresh");
    const client = new fresh.InMemoryRedis();

    expect(
      await client.set("value", "one", { type: "PX", value: 60_000 }),
    ).toBe("OK");
    expect(await client.set("value", "two", { type: "NX" })).toBeNull();
    expect(await client.set("missing", "two", { type: "XX" })).toBeNull();
    expect(await client.set("value", "two", { type: "XX" })).toBe("OK");
    expect(await client.get("value")).toBe("two");
    expect(await client.exists("value")).toBe(1);
    expect(await client.incr("counter")).toBe(1);
    expect(await client.expire("value", 60)).toBe(1);
    expect(await client.pexpire("value", 60_000)).toBe(1);
    expect(await client.ttl("value")).toBeGreaterThan(0);
    expect(await client.pttl("value")).toBeGreaterThan(0);
    expect(await client.ttl("missing")).toBe(-2);
    expect(await client.pttl("missing")).toBe(-2);
    expect(await client.llen("list")).toBe(0);
    expect(await client.expire("missing", 1)).toBe(0);
    expect(await client.pexpire("missing", 1)).toBe(0);

    expect(await client.hset("hash", ["a", "1"], ["b", "2"])).toBe(2);
    expect(await client.hset("hash", ["a", "3"])).toBe(0);
    expect(await client.hget("hash", "a")).toBe("3");
    expect(await client.hgetall("hash")).toEqual({ a: "3", b: "2" });
    expect(await client.hdel("hash", "a", "missing")).toBe(1);
    expect(await client.hdel("hash", "b")).toBe(1);
    expect(await client.hdel("missing-hash", "field")).toBe(0);
    expect(await client.hgetall("hash")).toEqual({});
    expect(await client.keys("cogito:cb:*")).toEqual([]);
    await client.hset("cogito:cb:resend", ["state", "open"]);
    await client.hset("cogito:cb:google_meet", ["state", "half-open"]);
    expect(await client.keys("cogito:cb:*")).toEqual([
      "cogito:cb:resend",
      "cogito:cb:google_meet",
    ]);
    expect(await client.keys("cogito:cb:resend")).toEqual(["cogito:cb:resend"]);
    expect(await client.del("value")).toBe(1);
    expect(await client.del("value")).toBe(0);
    expect(await client.ping()).toBe("PONG");
    expect(await client.quit()).toBe("OK");
    await expect(client.eval("", [], [])).rejects.toThrow("not supported");

    const originalNow = Date.now;
    let now = 1_000_000;
    Date.now = () => now;
    try {
      await client.set("expired", "value", { type: "EX", value: 1 });
      now += 2_000;
      expect(await client.get("expired")).toBeNull();
      expect(await client.exists("expired")).toBe(0);
      expect(await client.hget("expired", "field")).toBeNull();
      expect(await client.hgetall("expired")).toEqual({});
    } finally {
      Date.now = originalNow;
    }

    const calls: unknown[][] = [];
    const fakeClient = {
      get: async (key: string) => {
        calls.push(["get", key]);
        return "value";
      },
      set: async (key: string, value: string, ...args: (string | number)[]) => {
        calls.push(["set", key, value, ...args]);
        return "OK";
      },
      del: async (key: string) => {
        calls.push(["del", key]);
        return 1;
      },
      exists: async (key: string) => {
        calls.push(["exists", key]);
        return 1;
      },
      incr: async (key: string) => {
        calls.push(["incr", key]);
        return 2;
      },
      expire: async (key: string, seconds: number) => {
        calls.push(["expire", key, seconds]);
        return 1;
      },
      pexpire: async (key: string, ms: number) => {
        calls.push(["pexpire", key, ms]);
        return 1;
      },
      ttl: async (key: string) => {
        calls.push(["ttl", key]);
        return 1;
      },
      pttl: async (key: string) => {
        calls.push(["pttl", key]);
        return 1;
      },
      hset: async (key: string, ...fields: [string, string][]) => {
        calls.push(["hset", key, ...fields]);
        return fields.length;
      },
      hget: async (key: string, field: string) => {
        calls.push(["hget", key, field]);
        return "value";
      },
      hgetall: async (key: string) => {
        calls.push(["hgetall", key]);
        return { field: "value" };
      },
      hdel: async (key: string, ...fields: string[]) => {
        calls.push(["hdel", key, ...fields]);
        return fields.length;
      },
      keys: async (pattern: string) => {
        calls.push(["keys", pattern]);
        return ["cogito:cb:resend"];
      },
      llen: async (key: string) => {
        calls.push(["llen", key]);
        return 0;
      },
      eval: async (
        script: string,
        keyCount: number,
        ...args: (string | number)[]
      ) => {
        calls.push(["eval", script, keyCount, ...args]);
        return "evaluated";
      },
      ping: async () => {
        calls.push(["ping"]);
        return "PONG";
      },
      quit: async () => {
        calls.push(["quit"]);
        return "OK";
      },
    };
    const adapter = fresh.createRedisAdapter(fakeClient as any);

    await adapter.get("key");
    await adapter.set(
      "key",
      "value",
      { type: "EX", value: 1 },
      { type: "PX", value: 2 },
      { type: "NX" },
      { type: "XX" },
    );
    await adapter.del("key");
    await adapter.exists("key");
    await adapter.incr("key");
    await adapter.expire("key", 1);
    await adapter.pexpire("key", 2);
    await adapter.ttl("key");
    await adapter.pttl("key");
    await adapter.hset("hash", ["field", "value"]);
    await adapter.hget("hash", "field");
    await adapter.hgetall("hash");
    await adapter.hdel("hash", "field");
    await adapter.keys("cogito:cb:*");
    await adapter.llen("list");
    await adapter.eval("return 1", ["key"], ["arg"]);
    await adapter.ping();
    await adapter.quit();
    expect(calls).toHaveLength(18);

    expect(fresh.redisRetryStrategy(1)).toBe(200);
    expect(fresh.redisRetryStrategy(11)).toBeNull();
    fresh.logRedisFallback("coverage", new Error("fallback"));
    fresh.logRedisConnectionError(new Error("connection"));
    const fallback = fresh.createRedisFallback();
    expect(fallback).toBeInstanceOf(fresh.InMemoryRedis);

    const connected = fresh.initRedis("redis://localhost:6379");
    await expect(connected.ping()).resolves.toBe("PONG");
    await connected.quit();
    expect(fresh.getRedisClient()).toBe(connected);
  });
});
