import { describe, test, expect, mock } from "bun:test";
import { CircuitBreaker } from "../../lib/circuit-breaker";

describe("CircuitBreaker", () => {
  test("starts in closed state", () => {
    const cb = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeoutMs: 5000,
      halfOpenMaxAttempts: 1,
    });
    expect(cb.getState()).toBe("closed");
  });

  test("transitions from closed to open after reaching failure threshold", async () => {
    const cb = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeoutMs: 5000,
      halfOpenMaxAttempts: 1,
    });

    for (let i = 0; i < 3; i++) {
      await expect(
        cb.execute(() => Promise.reject(new Error("fail"))),
      ).rejects.toThrow("fail");
    }
    expect(cb.getState()).toBe("open");
  });

  test("rejects immediately when open and reset timeout not elapsed", async () => {
    const cb = new CircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 60000,
      halfOpenMaxAttempts: 1,
    });

    await expect(
      cb.execute(() => Promise.reject(new Error("fail"))),
    ).rejects.toThrow("fail");
    expect(cb.getState()).toBe("open");

    await expect(cb.execute(() => Promise.resolve("ok"))).rejects.toThrow(
      "Circuit breaker is open",
    );
  });

  test("transitions to half-open after reset timeout", async () => {
    const cb = new CircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 10,
      halfOpenMaxAttempts: 1,
    });

    await expect(
      cb.execute(() => Promise.reject(new Error("fail"))),
    ).rejects.toThrow("fail");
    expect(cb.getState()).toBe("open");

    await new Promise((resolve) => setTimeout(resolve, 20));

    const result = await cb.execute(() => Promise.resolve("ok"));
    expect(result).toBe("ok");
    expect(cb.getState()).toBe("closed");
  });

  test("reopens from half-open on failure", async () => {
    const cb = new CircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 10,
      halfOpenMaxAttempts: 1,
    });

    await expect(
      cb.execute(() => Promise.reject(new Error("fail"))),
    ).rejects.toThrow("fail");
    expect(cb.getState()).toBe("open");

    await new Promise((resolve) => setTimeout(resolve, 20));

    await expect(
      cb.execute(() => Promise.reject(new Error("fail again"))),
    ).rejects.toThrow("fail again");
    expect(cb.getState()).toBe("open");
  });

  test("resets failure count on success", async () => {
    const cb = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeoutMs: 5000,
      halfOpenMaxAttempts: 1,
    });

    await expect(
      cb.execute(() => Promise.reject(new Error("fail"))),
    ).rejects.toThrow("fail");
    await expect(
      cb.execute(() => Promise.reject(new Error("fail"))),
    ).rejects.toThrow("fail");

    await cb.execute(() => Promise.resolve("ok"));
    expect(cb.getState()).toBe("closed");

    await expect(
      cb.execute(() => Promise.reject(new Error("fail"))),
    ).rejects.toThrow("fail");
    expect(cb.getState()).toBe("closed");
  });

  test("calls monitor callback on failure", async () => {
    const monitor = mock((_state: string, _error?: unknown) => {});
    const cb = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeoutMs: 5000,
      halfOpenMaxAttempts: 1,
      monitor,
    });

    await expect(
      cb.execute(() => Promise.reject(new Error("fail"))),
    ).rejects.toThrow("fail");
    expect(monitor).toHaveBeenCalledTimes(1);
  });
});
