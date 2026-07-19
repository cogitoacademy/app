import { describe, test, expect, mock, afterEach } from "bun:test";
import { retryWithBackoff, fetchWithTimeout } from "../../lib/retry";

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

  test("throws when maxAttempts is 0", async () => {
    const fn = mock(async () => "ok");
    try {
      await retryWithBackoff(fn, {
        maxAttempts: 0,
        baseDelayMs: 1,
        maxDelayMs: 10,
        jitterMs: 0,
      });
      expect.unreachable("should have thrown");
    } catch {
      expect(fn).toHaveBeenCalledTimes(0);
    }
  });
});

describe("fetchWithTimeout", () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  });

  test("returns response on successful fetch", async () => {
    const response = new Response("ok", { status: 200 });
    globalThis.fetch = mock(() => Promise.resolve(response));

    const result = await fetchWithTimeout("https://example.com");
    expect(result).toBe(response);
  });

  test("passes url and init with signal to fetch", async () => {
    const response = new Response("ok", { status: 200 });
    const calls: Array<{ url: string; init: RequestInit }> = [];
    globalThis.fetch = mock(
      (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), init: init ?? {} });
        return Promise.resolve(response);
      },
    ) as never;

    await fetchWithTimeout("https://example.com/api", { method: "POST" });
    expect(calls[0].url).toBe("https://example.com/api");
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.signal).toBeDefined();
  });

  test("uses default timeout of 15000ms", async () => {
    const response = new Response("ok", { status: 200 });
    let timeoutMs = 0;
    globalThis.fetch = mock(() => Promise.resolve(response));
    globalThis.setTimeout = ((fn: () => void, ms: number) => {
      timeoutMs = ms;
      return 1;
    }) as never;
    globalThis.clearTimeout = () => {};

    await fetchWithTimeout("https://example.com");
    expect(timeoutMs).toBe(15000);
  });

  test("uses custom timeout when provided", async () => {
    const response = new Response("ok", { status: 200 });
    let timeoutMs = 0;
    globalThis.fetch = mock(() => Promise.resolve(response));
    globalThis.setTimeout = ((fn: () => void, ms: number) => {
      timeoutMs = ms;
      return 1;
    }) as never;
    globalThis.clearTimeout = () => {};

    await fetchWithTimeout("https://example.com", {}, 5000);
    expect(timeoutMs).toBe(5000);
  });

  test("clears timeout after successful fetch", async () => {
    const response = new Response("ok", { status: 200 });
    let clearedId: number | undefined;
    globalThis.fetch = mock(() => Promise.resolve(response));
    globalThis.setTimeout = (() => 42) as never;
    globalThis.clearTimeout = (id: number | undefined) => {
      clearedId = id;
    };

    await fetchWithTimeout("https://example.com");
    expect(clearedId).toBe(42);
  });

  test("clears timeout even when fetch throws", async () => {
    let clearedId: number | undefined;
    globalThis.fetch = mock(() => Promise.reject(new Error("network error")));
    globalThis.setTimeout = (() => 99) as never;
    globalThis.clearTimeout = (id: number | undefined) => {
      clearedId = id;
    };

    await expect(fetchWithTimeout("https://example.com")).rejects.toThrow(
      "network error",
    );
    expect(clearedId).toBe(99);
  });

  test("passes AbortSignal to fetch via AbortController", async () => {
    let capturedInit: RequestInit | undefined;
    const response = new Response("ok", { status: 200 });
    globalThis.fetch = mock(
      (_url: string | URL | Request, init?: RequestInit) => {
        capturedInit = init;
        return Promise.resolve(response);
      },
    ) as never;

    await fetchWithTimeout("https://example.com/api", { method: "GET" });
    expect(capturedInit).toBeDefined();
    expect(capturedInit!.signal).toBeInstanceOf(AbortSignal);
    expect(capturedInit!.method).toBe("GET");
  });

  test("aborts fetch when timeout fires", async () => {
    globalThis.fetch = mock(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init!.signal!.addEventListener("abort", () => {
            reject(
              new DOMException("The operation was aborted.", "AbortError"),
            );
          });
        }),
    ) as never;
    globalThis.setTimeout = ((fn: () => void, _ms: number) => {
      queueMicrotask(fn);
      return 1;
    }) as never;
    globalThis.clearTimeout = () => {};

    await expect(
      fetchWithTimeout("https://example.com", {}, 5000),
    ).rejects.toThrow("The operation was aborted.");
  });
});
