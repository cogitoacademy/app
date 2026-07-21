import { describe, test, expect, beforeEach, afterEach } from "bun:test";

let logCaptures: any[] = [];
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

beforeEach(() => {
  logCaptures = [];
  console.log = (...args: unknown[]) => {
    try {
      logCaptures.push(JSON.parse(args[0] as string));
    } catch {
      logCaptures.push(args);
    }
  };
  console.error = (...args: unknown[]) => {
    try {
      logCaptures.push(JSON.parse(args[0] as string));
    } catch {
      logCaptures.push(args);
    }
  };
  console.warn = (...args: unknown[]) => {
    try {
      logCaptures.push(JSON.parse(args[0] as string));
    } catch {
      logCaptures.push(args);
    }
  };
});

afterEach(() => {
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
});

import { createStubEmailProvider } from "../../modules/email/stub-email.provider";

describe("createStubEmailProvider", () => {
  const provider = createStubEmailProvider();

  test("send returns { skipped: true }", async () => {
    const result = await provider.send({
      to: "test@example.com",
      subject: "Hello",
      html: "<p>Hi</p>",
      category: "booking",
    });
    expect(result).toEqual({ skipped: true });
  });

  test("send logs message details", async () => {
    logCaptures = [];
    await provider.send({
      to: "user@example.com",
      subject: "Test Subject",
      html: "<p>Body</p>",
      category: "payment",
    });

    const logEntry = logCaptures.find((e) => e.action === "email_stub_send");
    expect(logEntry).toBeDefined();
    expect(logEntry.level).toBe("info");
    expect(logEntry.to).toBe("user@example.com");
    expect(logEntry.subject).toBe("Test Subject");
    expect(logEntry.category).toBe("payment");
  });
});
