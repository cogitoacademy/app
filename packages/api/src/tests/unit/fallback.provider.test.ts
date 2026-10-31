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
  test("class meeting setup remains failed until a provider is configured", async () => {
    const provider = createFallbackMeetingProvider({} as any);
    expect(
      await provider.createAcademyClassEvent!(
        "session1",
        new Date(),
        new Date(),
      ),
    ).toMatchObject({
      provider: "manual",
      status: "failed",
      externalEventId: null,
      meetingUrl: null,
    });
    await expect(provider.cancelAcademyClassEvent!("event1")).rejects.toThrow(
      "Google Calendar cancellation is unavailable",
    );
  });
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

  test("createEvent persists attendeeEmails when attendees provided", async () => {
    const insertedRow = {
      id: "me1",
      bookingId: "b3",
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
    await provider.createEvent("b3", undefined, undefined, [
      { email: "tutor@example.com", name: "Tutor" },
      { email: "student@example.com" },
    ]);

    const insertValues = values.mock.calls[0]?.[0] as {
      attendeeEmails: string[] | null;
    };
    expect(insertValues.attendeeEmails).toEqual([
      "tutor@example.com",
      "student@example.com",
    ]);
  });

  test("updateEvent is a no-op (manual links carry no provider event)", async () => {
    const db = { insert: mock(() => ({})) } as any;
    const provider = createFallbackMeetingProvider(db);
    await expect(provider.updateEvent()).resolves.toBeUndefined();
  });

  test("cancelEvent marks local rows cancelled for the booking", async () => {
    const where = mock(async () => {});
    const set = mock(() => ({ where }));
    const update = mock(() => ({ set }));
    const db = { update } as any;

    const provider = createFallbackMeetingProvider(db);
    await provider.cancelEvent("b1");

    expect(update).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith({ status: "cancelled" });
    expect(where).toHaveBeenCalledTimes(1);
  });

  test("cancelEvent logs an error when the update throws", async () => {
    const where = mock(async () => {
      throw new Error("db down");
    });
    const set = mock(() => ({ where }));
    const update = mock(() => ({ set }));
    const db = { update } as any;

    logCaptures = [];
    const provider = createFallbackMeetingProvider(db);
    await expect(provider.cancelEvent("b1")).resolves.toBeUndefined();

    const errorLog = logCaptures.find(
      (e) => e.action === "meeting_manual_cancel_failed",
    );
    expect(errorLog).toBeDefined();
    expect(errorLog.bookingId).toBe("b1");
  });

  test("setManualLink creates a local row when no meeting exists", async () => {
    const createdRow = {
      id: "me_new",
      bookingId: "b4",
      provider: "manual",
      status: "created",
      meetingUrl: "https://meet.example.com/b4",
      externalEventId: null,
    };
    const limit = mock(async () => []);
    const orderBy = mock(() => ({ limit }));
    const where = mock(() => ({ orderBy }));
    const from = mock(() => ({ where }));
    const select = mock(() => ({ from }));
    const returning = mock(async () => [createdRow]);
    const values = mock(() => ({ returning }));
    const insert = mock(() => ({ values }));
    const db = { select, insert } as any;

    const provider = createFallbackMeetingProvider(db);
    const result = await provider.setManualLink("b4", createdRow.meetingUrl);

    expect(result).toEqual(createdRow);
    expect(values).toHaveBeenCalledWith({
      bookingId: "b4",
      provider: "manual",
      status: "created",
      meetingUrl: "https://meet.example.com/b4",
      externalEventId: null,
    });
  });

  test("setManualLink updates the latest existing meeting event", async () => {
    const existing = { id: "me-existing" };
    const updated = {
      id: "me-existing",
      bookingId: "b-existing",
      meetingUrl: "https://meet.example.com/new",
      status: "created",
    };
    const returning = mock(async () => [updated]);
    const whereUpdate = mock(() => ({ returning }));
    const set = mock(() => ({ where: whereUpdate }));
    const update = mock(() => ({ set }));
    const limit = mock(async () => [existing]);
    const orderBy = mock(() => ({ limit }));
    const whereSelect = mock(() => ({ orderBy }));
    const from = mock(() => ({ where: whereSelect }));
    const select = mock(() => ({ from }));
    const insert = mock(() => {
      throw new Error("existing event should be updated");
    });
    const provider = createFallbackMeetingProvider({
      select,
      update,
      insert,
    } as any);

    expect(
      await provider.setManualLink("b-existing", updated.meetingUrl),
    ).toEqual(updated);
    expect(set).toHaveBeenCalledWith({
      provider: "manual",
      status: "created",
      meetingUrl: updated.meetingUrl,
      errorReason: null,
    });
    expect(insert).not.toHaveBeenCalled();
  });

  test("F10: setManualLink writes through the passed conn (tx) so a rollback leaves no orphan row", async () => {
    const createdRow = {
      id: "me_tx",
      bookingId: "b5",
      provider: "manual",
      status: "created",
      meetingUrl: "https://meet.example.com/b5",
      externalEventId: null,
    };
    // The global db is instrumented and must NOT be touched when conn is
    // provided — a tx write that later rolls back would otherwise orphan a row
    // written on the global connection.
    const globalSelect = mock(() => {
      throw new Error("global db must not be used when conn is passed");
    });
    const globalInsert = mock(() => {
      throw new Error("global db must not be used when conn is passed");
    });
    const db = { select: globalSelect, insert: globalInsert } as any;

    const limit = mock(async () => []);
    const orderBy = mock(() => ({ limit }));
    const where = mock(() => ({ orderBy }));
    const from = mock(() => ({ where }));
    const select = mock(() => ({ from }));
    const returning = mock(async () => [createdRow]);
    const values = mock(() => ({ returning }));
    const insert = mock(() => ({ values }));
    const tx = { select, insert } as any;

    const provider = createFallbackMeetingProvider(db);
    const result = await provider.setManualLink(
      "b5",
      createdRow.meetingUrl,
      tx,
    );

    expect(result).toEqual(createdRow);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalledTimes(1);
    expect(globalSelect).not.toHaveBeenCalled();
    expect(globalInsert).not.toHaveBeenCalled();
  });
});
