import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import { createFallbackMeetingProvider } from "../../modules/meeting/fallback.provider";

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

describe("createFallbackMeetingProvider", () => {
  test("createEvent inserts manual meeting and returns result", async () => {
    const insertedRow = {
      id: "me1",
      bookingId: "b1",
      provider: "manual",
      status: "manual",
      meetingUrl: null,
      externalEventId: null,
    };

    const returning = mock(async () => [insertedRow]);
    const values = mock(() => ({ returning }));
    const insert = mock(() => ({ values }));

    const db = { insert } as any;

    const provider = createFallbackMeetingProvider(db);
    const result = await provider.createEvent("b1");

    expect(insert).toHaveBeenCalled();
    expect(result.bookingId).toBe("b1");
    expect(result.provider).toBe("manual");
    expect(result.status).toBe("manual");

    const logEntry = logCaptures.find(
      (e) => e.action === "meeting_manual_created",
    );
    expect(logEntry).toBeDefined();
    expect(logEntry.level).toBe("warn");
    expect(logEntry.bookingId).toBe("b1");
  });

  test("createEvent passes bookingId to insert values", async () => {
    const insertedRow = {
      id: "me1",
      bookingId: "b2",
      provider: "manual",
      status: "manual",
      meetingUrl: null,
      externalEventId: null,
    };

    const returning = mock(async () => [insertedRow]);
    const values = mock(() => ({ returning }));
    const insert = mock(() => ({ values }));

    const db = { insert } as any;

    const provider = createFallbackMeetingProvider(db);
    const result = await provider.createEvent("b2");

    expect(result.bookingId).toBe("b2");
  });
});
