import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { log, initStructuredLogger } from "../../lib/logger";

describe("Logger", () => {
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;
  let captured: { level: string; entry: Record<string, unknown> }[] = [];

  beforeEach(() => {
    captured = [];
    initStructuredLogger("test-service");
    console.log = mock((...args: unknown[]) => {
      captured.push({
        level: "info",
        entry: JSON.parse(args[0] as string),
      });
    });
    console.error = mock((...args: unknown[]) => {
      captured.push({
        level: "error",
        entry: JSON.parse(args[0] as string),
      });
    });
    console.warn = mock((...args: unknown[]) => {
      captured.push({
        level: "warn",
        entry: JSON.parse(args[0] as string),
      });
    });
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
  });

  test("log emits info level by default", () => {
    log({ action: "test_action" });
    expect(captured).toHaveLength(1);
    expect(captured[0].level).toBe("info");
    expect(captured[0].entry.service).toBe("test-service");
    expect(captured[0].entry.action).toBe("test_action");
    expect(captured[0].entry.timestamp).toBeDefined();
  });

  test("log emits error level to console.error", () => {
    log({ level: "error", action: "test_error", error: { message: "oops" } });
    expect(captured).toHaveLength(1);
    expect(captured[0].level).toBe("error");
    expect(captured[0].entry.error.message).toBe("oops");
  });

  test("log emits warn level to console.warn", () => {
    log({ level: "warn", action: "test_warn" });
    expect(captured).toHaveLength(1);
    expect(captured[0].level).toBe("warn");
    expect(captured[0].entry.action).toBe("test_warn");
  });

  test("initStructuredLogger changes service name", () => {
    initStructuredLogger("custom-service");
    log({ action: "custom" });
    expect(captured[0].entry.service).toBe("custom-service");
  });

  test("log includes optional fields", () => {
    log({
      action: "request",
      requestId: "req-123",
      userId: "user-456",
      durationMs: 150,
    });
    expect(captured[0].entry.requestId).toBe("req-123");
    expect(captured[0].entry.userId).toBe("user-456");
    expect(captured[0].entry.durationMs).toBe(150);
  });
});
