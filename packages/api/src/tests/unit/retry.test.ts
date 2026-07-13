import { describe, test, expect, mock } from "bun:test";
import { retryWithBackoff } from "../../lib/retry";

describe("retryWithBackoff", () => {
  test("returns result on first successful attempt", async () => {
    const fn = mock(() => Promise.resolve("ok"));
    const result = await retryWithBackoff(fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("retries on retryable error and succeeds", async () => {
    let callCount = 0;
    const fn = mock(() => {
      callCount++;
      if (callCount < 3) throw new TypeError("fetch failed");
      return Promise.resolve("ok");
    });
    const result = await retryWithBackoff(fn, {
      baseDelayMs: 1,
      maxDelayMs: 10,
      jitterMs: 0,
    });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  test("throws immediately for non-retryable error", async () => {
    const fn = mock(() => {
      throw new Error("non-retryable");
    });
    await expect(retryWithBackoff(fn)).rejects.toThrow("non-retryable");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test("throws after max attempts exhausted", async () => {
    const fn = mock(() => {
      throw new TypeError("fetch error");
    });
    await expect(
      retryWithBackoff(fn, {
        maxAttempts: 2,
        baseDelayMs: 1,
        maxDelayMs: 10,
        jitterMs: 0,
      }),
    ).rejects.toThrow("fetch error");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test("uses exponential backoff delay", async () => {
    const delays: number[] = [];
    let callCount = 0;
    const originalSetTimeout = globalThis.setTimeout;
    globalThis.setTimeout = ((fn: () => void, ms: number) => {
      delays.push(ms);
      return originalSetTimeout(fn, 0);
    }) as never;

    try {
      const fn = mock(() => {
        callCount++;
        if (callCount < 4) throw new TypeError("fetch error");
        return Promise.resolve("ok");
      });
      await retryWithBackoff(fn, {
        maxAttempts: 4,
        baseDelayMs: 100,
        maxDelayMs: 5000,
        jitterMs: 0,
      });
      expect(delays.length).toBe(3);
      expect(delays[0]).toBeGreaterThanOrEqual(100);
      expect(delays[1]).toBeGreaterThanOrEqual(200);
      expect(delays[2]).toBeGreaterThanOrEqual(400);
    } finally {
      globalThis.setTimeout = originalSetTimeout;
    }
  });

  test("custom retryable function", async () => {
    const fn = mock(() => {
      throw new RangeError("out of range");
    });
    await expect(
      retryWithBackoff(fn, {
        maxAttempts: 2,
        baseDelayMs: 1,
        maxDelayMs: 10,
        jitterMs: 0,
        retryable: (err) => err instanceof RangeError,
      }),
    ).rejects.toThrow("out of range");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
