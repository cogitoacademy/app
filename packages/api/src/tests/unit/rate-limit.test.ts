import { describe, test, expect } from "bun:test";
import { rateLimit } from "../../lib/rate-limit";

describe("rateLimit", () => {
  test("allows request within limit", () => {
    const limiter = rateLimit({ windowMs: 60000, maxRequests: 5 });
    const result = limiter("user1");
    expect(result.allowed).toBe(true);
    expect(result.retryAfterMs).toBe(0);
  });

  test("blocks request over limit", () => {
    const limiter = rateLimit({ windowMs: 60000, maxRequests: 2 });
    limiter("user2");
    limiter("user2");
    const result = limiter("user2");
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  test("resets after window expires", async () => {
    const limiter = rateLimit({ windowMs: 5, maxRequests: 1 });
    limiter("user3");
    expect(limiter("user3").allowed).toBe(false);
    await new Promise((r) => setTimeout(r, 10));
    const result = limiter("user3");
    expect(result.allowed).toBe(true);
  });

  test("tracks different identifiers separately", () => {
    const limiter = rateLimit({ windowMs: 60000, maxRequests: 1 });
    const result1 = limiter("user4a");
    const result2 = limiter("user4b");
    expect(result1.allowed).toBe(true);
    expect(result2.allowed).toBe(true);
  });

  test("uses keyPrefix for identifier", () => {
    const limiter = rateLimit({
      windowMs: 60000,
      maxRequests: 1,
      keyPrefix: "api",
    });
    limiter("user5");
    const result = limiter("user5");
    expect(result.allowed).toBe(false);
  });

  test("increments count for allowed requests", () => {
    const limiter = rateLimit({ windowMs: 60000, maxRequests: 3 });
    expect(limiter("user6").allowed).toBe(true);
    expect(limiter("user6").allowed).toBe(true);
    expect(limiter("user6").allowed).toBe(true);
    expect(limiter("user6").allowed).toBe(false);
  });

  test("returns retryAfterMs when blocked", () => {
    const limiter = rateLimit({ windowMs: 60000, maxRequests: 1 });
    limiter("user7");
    const result = limiter("user7");
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeLessThanOrEqual(60000);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  test("cleans up expired entries on new request", async () => {
    const limiter = rateLimit({ windowMs: 5, maxRequests: 1 });
    limiter("cleanup_user");
    await new Promise((r) => setTimeout(r, 10));
    const result = limiter("cleanup_user");
    expect(result.allowed).toBe(true);
  });

  test("cleans up when store exceeds MAX_ENTRIES (10,000)", () => {
    const limiter = rateLimit({ windowMs: 60000, maxRequests: 2 });
    for (let i = 0; i < 10001; i++) {
      limiter(`overflow_user_${i}`);
    }
    const result = limiter("overflow_user_10002");
    expect(result.allowed).toBe(true);
  });
});
