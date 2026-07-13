import { describe, test, expect, beforeEach, afterEach } from "bun:test";

describe("Logger", () => {
  let captured: { level: string; entry: Record<string, unknown> }[] = [];
  let originalConsoleLog: typeof console.log;
  let originalConsoleError: typeof console.error;
  let originalConsoleWarn: typeof console.warn;

  beforeEach(() => {
    captured = [];
    originalConsoleLog = console.log;
    originalConsoleError = console.error;
    originalConsoleWarn = console.warn;
    console.log = (...args: unknown[]) => {
      try {
        captured.push({ level: "info", entry: JSON.parse(args[0] as string) });
      } catch {
        captured.push({ level: "info", entry: { raw: args[0] } });
      }
    };
    console.error = (...args: unknown[]) => {
      try {
        captured.push({ level: "error", entry: JSON.parse(args[0] as string) });
      } catch {
        captured.push({ level: "error", entry: { raw: args[0] } });
      }
    };
    console.warn = (...args: unknown[]) => {
      try {
        captured.push({ level: "warn", entry: JSON.parse(args[0] as string) });
      } catch {
        captured.push({ level: "warn", entry: { raw: args[0] } });
      }
    };
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
  });

  test("log emits info level by default", async () => {
    const { log, initStructuredLogger } = await import("../../lib/logger");
    initStructuredLogger("test-service");
    log({ action: "test_action" });
    expect(captured).toHaveLength(1);
    expect(captured[0].level).toBe("info");
    expect(captured[0].entry.service).toBe("test-service");
    expect(captured[0].entry.action).toBe("test_action");
    expect(captured[0].entry.timestamp).toBeDefined();
  });

  test("log emits error level to console.error", async () => {
    const { log, initStructuredLogger } = await import("../../lib/logger");
    initStructuredLogger("test-service");
    log({ level: "error", action: "test_error", error: { message: "oops" } });
    expect(captured).toHaveLength(1);
    expect(captured[0].level).toBe("error");
    expect(captured[0].entry.error.message).toBe("oops");
  });

  test("log emits warn level to console.warn", async () => {
    const { log, initStructuredLogger } = await import("../../lib/logger");
    initStructuredLogger("test-service");
    log({ level: "warn", action: "test_warn" });
    expect(captured).toHaveLength(1);
    expect(captured[0].level).toBe("warn");
    expect(captured[0].entry.action).toBe("test_warn");
  });

  test("initStructuredLogger changes service name", async () => {
    const { log, initStructuredLogger } = await import("../../lib/logger");
    initStructuredLogger("custom-service");
    log({ action: "custom" });
    expect(captured).toHaveLength(1);
    expect(captured[0].entry.service).toBe("custom-service");
  });

  test("log includes optional fields", async () => {
    const { log, initStructuredLogger } = await import("../../lib/logger");
    initStructuredLogger("test-service");
    log({
      action: "request",
      requestId: "req-123",
      userId: "user-456",
      durationMs: 150,
    });
    expect(captured).toHaveLength(1);
    expect(captured[0].entry.requestId).toBe("req-123");
    expect(captured[0].entry.userId).toBe("user-456");
    expect(captured[0].entry.durationMs).toBe(150);
  });
});
