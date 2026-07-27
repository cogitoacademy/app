import { describe, test, expect, beforeEach, mock } from "bun:test";
import { CircuitBreaker } from "../../lib/circuit-breaker";
import { InMemoryRedis, COGITO_NS } from "../../lib/redis";
import type { RedisClient } from "../../lib/redis";

describe("CircuitBreaker with Redis", () => {
  let redis: InMemoryRedis;

  beforeEach(() => {
    redis = new InMemoryRedis();
  });

  test("persists state to Redis on failure", async () => {
    const cb = new CircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 60000,
      halfOpenMaxAttempts: 1,
      name: "test-cb",
      redis: redis as unknown as RedisClient,
    });

    await expect(
      cb.execute(() => Promise.reject(new Error("fail"))),
    ).rejects.toThrow("fail");

    const state = await redis.hgetall(`${COGITO_NS.CIRCUIT_BREAKER}:test-cb`);
    expect(state.state).toBe("open");
    expect(state.failureCount).toBe("1");
  });

  test("persists state to Redis on success", async () => {
    const cb = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeoutMs: 60000,
      halfOpenMaxAttempts: 1,
      name: "test-cb",
      redis: redis as unknown as RedisClient,
    });

    await cb.execute(() => Promise.resolve("ok"));

    const state = await redis.hgetall(`${COGITO_NS.CIRCUIT_BREAKER}:test-cb`);
    expect(state.state).toBe("closed");
    expect(state.failureCount).toBe("0");
  });

  test("loads state from Redis on execute", async () => {
    await redis.hset(
      `${COGITO_NS.CIRCUIT_BREAKER}:test-cb`,
      ["state", "closed"],
      ["failureCount", "0"],
      ["lastFailureTime", "0"],
      ["halfOpenAttempts", "0"],
    );

    const cb = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeoutMs: 60000,
      halfOpenMaxAttempts: 1,
      name: "test-cb",
      redis: redis as unknown as RedisClient,
    });

    const result = await cb.execute(() => Promise.resolve("ok"));
    expect(result).toBe("ok");
  });

  test("works without Redis (in-memory fallback)", async () => {
    const cb = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeoutMs: 60000,
      halfOpenMaxAttempts: 1,
    });

    await cb.execute(() => Promise.resolve("ok"));
    expect(cb.getState()).toBe("closed");
  });

  test("falls back to in-memory when Redis saveState fails", async () => {
    const brokenRedis: RedisClient = {
      get: mock(async () => null),
      set: mock(async () => {
        throw new Error("Redis down");
      }),
      del: mock(async () => 0),
      exists: mock(async () => 0),
      incr: mock(async () => 1),
      expire: mock(async () => 0),
      pexpire: mock(async () => 0),
      ttl: mock(async () => -2),
      pttl: mock(async () => -2),
      hset: mock(async () => {
        throw new Error("Redis down");
      }),
      hget: mock(async () => null),
      hgetall: mock(async () => ({})),
      hdel: mock(async () => 0),
      eval: mock(async () => null),
      ping: mock(async () => "PONG"),
      quit: mock(async () => "OK"),
    };

    const cb = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeoutMs: 60000,
      halfOpenMaxAttempts: 1,
      name: "test-cb-broken",
      redis: brokenRedis,
    });

    await cb.execute(() => Promise.resolve("ok"));
    expect(cb.getState()).toBe("closed");
  });
});

describe("IdempotencyStore with Redis", () => {
  let redis: InMemoryRedis;

  beforeEach(() => {
    redis = new InMemoryRedis();
  });

  test("stores and retrieves via Redis", async () => {
    const { IdempotencyStore } = await import("../../lib/idempotency");
    const store = new IdempotencyStore({
      redis: redis as unknown as RedisClient,
    });

    await store.markProcessed("key1", { status: "ok" });
    expect(await store.isProcessed("key1")).toBe(true);
    expect(await store.getResult("key1")).toEqual({ status: "ok" });
  });

  test("falls back to in-memory when Redis fails", async () => {
    const { IdempotencyStore } = await import("../../lib/idempotency");
    const brokenRedis: RedisClient = {
      get: mock(async () => {
        throw new Error("down");
      }),
      set: mock(async () => {
        throw new Error("down");
      }),
      del: mock(async () => 0),
      exists: mock(async () => {
        throw new Error("down");
      }),
      incr: mock(async () => 1),
      expire: mock(async () => 0),
      pexpire: mock(async () => 0),
      ttl: mock(async () => -2),
      pttl: mock(async () => -2),
      hset: mock(async () => 0),
      hget: mock(async () => null),
      hgetall: mock(async () => ({})),
      hdel: mock(async () => 0),
      eval: mock(async () => null),
      ping: mock(async () => "PONG"),
      quit: mock(async () => "OK"),
    };

    const store = new IdempotencyStore({ redis: brokenRedis });

    await store.markProcessed("key1", { status: "fallback" });
    expect(await store.isProcessed("key1")).toBe(true);
    expect(await store.getResult("key1")).toEqual({ status: "fallback" });
  });

  test("uses Redis prefix for keys", async () => {
    const { IdempotencyStore } = await import("../../lib/idempotency");
    const store = new IdempotencyStore({
      redis: redis as unknown as RedisClient,
    });

    await store.markProcessed("test-key", { ok: true });
    const val = await redis.get(`${COGITO_NS.IDEMPOTENCY}:test-key`);
    expect(val).not.toBeNull();
  });
});

describe("rateLimit with Redis", () => {
  test("rateLimit without redis uses in-memory path", () => {
    const { rateLimit, resetRateLimitStore } = require("../../lib/rate-limit");
    resetRateLimitStore();
    const limiter = rateLimit({ windowMs: 60000, maxRequests: 2 });
    expect(limiter("user1").allowed).toBe(true);
    expect(limiter("user1").allowed).toBe(true);
    expect(limiter("user1").allowed).toBe(false);
  });
});
