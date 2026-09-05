import { describe, test, expect, beforeEach, afterEach } from "bun:test";

describe("logger trace allowlist (T1)", () => {
  let captured: Record<string, unknown>[] = [];
  let originalConsoleLog: typeof console.log;
  let originalConsoleError: typeof console.error;
  let originalConsoleWarn: typeof console.warn;

  beforeEach(() => {
    captured = [];
    originalConsoleLog = console.log;
    originalConsoleError = console.error;
    originalConsoleWarn = console.warn;
    const capture = (...args: unknown[]) => {
      try {
        captured.push(JSON.parse(args[0] as string));
      } catch {
        captured.push({ raw: args[0] });
      }
    };
    console.log = capture;
    console.error = capture;
    console.warn = capture;
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
  });

  test("passes traceId through and drops any email key", async () => {
    const { log, initStructuredLogger } = await import("../../lib/logger");
    initStructuredLogger("trace-test-service");
    log({
      action: "request_complete",
      requestId: "req_1",
      traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
      userId: "u1",
      email: "someone@example.com",
    } as unknown as Parameters<typeof log>[0]);
    expect(captured).toHaveLength(1);
    expect(captured[0]!.traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
    expect(captured[0]!.userId).toBe("u1");
    expect("email" in captured[0]!).toBe(false);
    expect(JSON.stringify(captured[0]!)).not.toContain("someone@example.com");
  });
});
