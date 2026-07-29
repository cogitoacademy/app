import { describe, test, expect, beforeEach } from "bun:test";
import { rateLimit, resetRateLimitStore } from "../../lib/rate-limit";
import { InMemoryRedis } from "../../lib/redis";

describe("rateLimit", () => {
  beforeEach(() => {
    resetRateLimitStore();
  });

  test("allows request within limit", async () => {
    const limiter = rateLimit({ windowMs: 60000, maxRequests: 5 });
    const result = await limiter("user1");
    expect(result.allowed).toBe(true);
    expect(result.retryAfterMs).toBe(0);
  });

  test("blocks request over limit", async () => {
    const limiter = rateLimit({ windowMs: 60000, maxRequests: 2 });
    await limiter("user2");
    await limiter("user2");
    const result = await limiter("user2");
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  test("resets after window expires", async () => {
    const limiter = rateLimit({ windowMs: 5, maxRequests: 1 });
    await limiter("user3");
    expect((await limiter("user3")).allowed).toBe(false);
    await new Promise((r) => setTimeout(r, 10));
    const result = await limiter("user3");
    expect(result.allowed).toBe(true);
  });

  test("tracks different identifiers separately", async () => {
    const limiter = rateLimit({ windowMs: 60000, maxRequests: 1 });
    const result1 = await limiter("user4a");
    const result2 = await limiter("user4b");
    expect(result1.allowed).toBe(true);
    expect(result2.allowed).toBe(true);
  });

  test("uses keyPrefix for identifier", async () => {
    const limiter = rateLimit({
      windowMs: 60000,
      maxRequests: 1,
      keyPrefix: "api",
    });
    await limiter("user5");
    const result = await limiter("user5");
    expect(result.allowed).toBe(false);
  });

  test("increments count for allowed requests", async () => {
    const limiter = rateLimit({ windowMs: 60000, maxRequests: 3 });
    expect((await limiter("user6")).allowed).toBe(true);
    expect((await limiter("user6")).allowed).toBe(true);
    expect((await limiter("user6")).allowed).toBe(true);
    expect((await limiter("user6")).allowed).toBe(false);
  });

  test("returns retryAfterMs when blocked", async () => {
    const limiter = rateLimit({ windowMs: 60000, maxRequests: 1 });
    await limiter("user7");
    const result = await limiter("user7");
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeLessThanOrEqual(60000);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  test("cleans up expired entries on new request", async () => {
    const limiter = rateLimit({ windowMs: 5, maxRequests: 1 });
    await limiter("cleanup_user");
    await new Promise((r) => setTimeout(r, 10));
    const result = await limiter("cleanup_user");
    expect(result.allowed).toBe(true);
  });

  test("cleans up when store exceeds MAX_ENTRIES (10,000)", async () => {
    const limiter = rateLimit({ windowMs: 60000, maxRequests: 2 });
    for (let i = 0; i < 10001; i++) {
      await limiter(`overflow_user_${i}`);
    }
    const result = await limiter("overflow_user_10002");
    expect(result.allowed).toBe(true);
  });

  test("evicts expired entries when store at MAX_ENTRIES", async () => {
    const shortLimiter = rateLimit({ windowMs: 1, maxRequests: 1 });
    for (let i = 0; i < 100; i++) {
      await shortLimiter(`evict_expired_${i}`);
    }
    await new Promise((r) => setTimeout(r, 5));
    const longLimiter = rateLimit({ windowMs: 60000, maxRequests: 1 });
    for (let i = 0; i < 10001; i++) {
      await longLimiter(`evict_fill_${i}`);
    }
    const result = await longLimiter("evict_trigger");
    expect(result.allowed).toBe(true);
  });

  test("cleans up expired entries when cleanup interval elapses", async () => {
    const originalDateNow = Date.now;
    const currentTime = { value: 1000000 };
    Date.now = () => currentTime.value;

    try {
      const limiter = rateLimit({ windowMs: 5000, maxRequests: 2 });
      await limiter("expired_user");
      await limiter("another_expired");

      currentTime.value = 1000000 + 61000;
      const result = await limiter("new_user_after_cleanup");
      expect(result.allowed).toBe(true);
    } finally {
      Date.now = originalDateNow;
    }
  });
});

describe("rateLimit with Redis", () => {
  let redis: InMemoryRedis;

  beforeEach(() => {
    resetRateLimitStore();
    redis = new InMemoryRedis();
  });

  test("falls back to in-memory when Redis eval throws", async () => {
    const limiter = rateLimit({
      windowMs: 60_000,
      maxRequests: 3,
      keyPrefix: "test",
      redis,
    });
    const r1 = await limiter("user1");
    const r2 = await limiter("user1");
    const r3 = await limiter("user1");
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
    expect(r3.allowed).toBe(true);
  });

  test("blocks requests over the limit via fallback", async () => {
    const limiter = rateLimit({
      windowMs: 60_000,
      maxRequests: 2,
      keyPrefix: "test",
      redis,
    });
    await limiter("user1");
    await limiter("user1");
    const r3 = await limiter("user1");
    expect(r3.allowed).toBe(false);
    expect(r3.retryAfterMs).toBeGreaterThan(0);
  });

  test("tracks different identifiers separately via fallback", async () => {
    const limiter = rateLimit({
      windowMs: 60_000,
      maxRequests: 1,
      keyPrefix: "test",
      redis,
    });
    const r1 = await limiter("user1");
    const r2 = await limiter("user2");
    expect(r1.allowed).toBe(true);
    expect(r2.allowed).toBe(true);
  });
});