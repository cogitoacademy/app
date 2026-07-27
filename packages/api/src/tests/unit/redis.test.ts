import { describe, test, expect, beforeEach } from "bun:test";
import { InMemoryRedis, COGITO_NS } from "../../lib/redis";

class TestInMemoryRedis extends InMemoryRedis {}

describe("InMemoryRedis", () => {
  let redis: TestInMemoryRedis;

  beforeEach(() => {
    redis = new TestInMemoryRedis();
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
