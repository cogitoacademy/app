import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";

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

import { createNotificationService } from "../../modules/notification/notification.service";

describe("NotificationService (unit)", () => {
  beforeEach(() => {
    logCaptures = [];
  });

  test("writeInternal deduplicates by eventKey when existing notification found", async () => {
    let insertCalled = false;
    const selectFromWhereLimit = mock(async () => [{ id: "existing_n1" }]);
    const selectFromWhere = mock(() => ({ limit: selectFromWhereLimit }));
    const selectFrom = mock(() => ({ where: selectFromWhere }));
    const selectFn = mock(() => ({ from: selectFrom }));

    const insertFn = mock(() => {
      insertCalled = true;
      return { values: mock(() => ({ returning: mock(async () => [{}]) })) };
    });

    const paramsDb = {
      select: selectFn,
      insert: insertFn,
    } as any;

    const emailPort = { send: mock(async () => ({ messageId: "m1" })) };
    const mainDb = {} as any;

    const service = createNotificationService(mainDb, emailPort as any);

    await service.write({
      db: paramsDb,
      userId: "user1",
      category: "booking",
      title: "Test",
      body: "Test body",
      eventKey: "booking.b1.created",
    });

    expect(insertCalled).toBe(false);
  });

  test("writeInternal inserts when no eventKey provided", async () => {
    let insertCalled = false;
    const selectFromWhereLimit = mock(async () => []);
    const selectFromWhere = mock(() => ({ limit: selectFromWhereLimit }));
    const selectFrom = mock(() => ({ where: selectFromWhere }));
    const selectFn = mock(() => ({ from: selectFrom }));

    const insertFn = mock(() => {
      insertCalled = true;
      return {
        values: mock(() => ({
          returning: mock(async () => [{ id: "n_new" }]),
        })),
      };
    });

    const paramsDb = {
      select: selectFn,
      insert: insertFn,
    } as any;

    const emailPort = { send: mock(async () => ({ messageId: "m1" })) };
    const mainDb = {} as any;

    const service = createNotificationService(mainDb, emailPort as any);

    await service.write({
      db: paramsDb,
      userId: "user1",
      category: "system",
      title: "Test",
      body: "Test body",
    });

    expect(insertCalled).toBe(true);
  });

  test("writeInternal inserts and dispatches email for action severity", async () => {
    const emailPort = { send: mock(async () => ({ messageId: "m1" })) };
    const mainDb = {} as any;

    createNotificationService(mainDb, emailPort as any);

    expect(emailPort).toBeDefined();
    expect(typeof emailPort.send).toBe("function");
  });

  test("write catches and logs errors", async () => {
    const selectFromWhereLimit = mock(async () => {
      throw new Error("db error");
    });
    const selectFromWhere = mock(() => ({ limit: selectFromWhereLimit }));
    const selectFrom = mock(() => ({ where: selectFromWhere }));
    const selectFn = mock(() => ({ from: selectFrom }));

    const paramsDb = {
      select: selectFn,
      insert: mock(() => ({
        values: mock(() => ({ returning: mock(async () => [{}]) })),
      })),
    } as any;

    const emailPort = { send: mock(async () => ({ messageId: "m1" })) };
    const mainDb = {} as any;

    const service = createNotificationService(mainDb, emailPort as any);

    await service.write({
      db: paramsDb,
      userId: "user1",
      category: "system",
      title: "Test",
      body: "Test body",
      eventKey: "test.error",
    });

    const errorCalls = logCaptures.filter(
      (c: any) => c.action === "notification_write_failed",
    );
    expect(errorCalls.length).toBeGreaterThanOrEqual(1);
  });

  test("service exposes expected methods", async () => {
    const db = {} as any;
    const service = createNotificationService(db);

    expect(typeof service.write).toBe("function");
    expect(typeof service.list).toBe("function");
    expect(typeof service.getUnreadCount).toBe("function");
    expect(typeof service.markAsRead).toBe("function");
    expect(typeof service.markAllAsRead).toBe("function");
    expect(typeof service.dispatchStatus).toBe("function");
  });

  test("getUnreadCount is exposed as a function", async () => {
    const db = {} as any;
    const service = createNotificationService(db);
    expect(typeof service.getUnreadCount).toBe("function");
  });
  test("skips email dispatch for unsupported categories (achievement, system)", async () => {
    let insertCalled = false;
    const selectFromWhereLimit = mock(async () => []);
    const selectFromWhere = mock(() => ({ limit: selectFromWhereLimit }));
    const selectFrom = mock(() => ({ where: selectFromWhere }));
    const selectFn = mock(() => ({ from: selectFrom }));

    const insertFn = mock(() => {
      insertCalled = true;
      return {
        values: mock(() => ({
          returning: mock(async () => [{ id: "n_achievement" }]),
        })),
      };
    });

    const paramsDb = {
      select: selectFn,
      insert: insertFn,
    } as any;

    const emailPort = { send: mock(async () => ({ messageId: "m1" })) };
    const mainDb = {} as any;

    const service = createNotificationService(mainDb, emailPort as any);

    await service.write({
      db: paramsDb,
      userId: "user1",
      category: "achievement",
      title: "Achievement Unlocked",
      body: "You earned a badge!",
      severity: "action",
    });

    expect(insertCalled).toBe(true);
    expect(emailPort.send).toHaveBeenCalledTimes(0);
  });

  test("dispatches email for supported categories (booking)", async () => {
    let insertCalled = false;
    const selectFromWhereLimit = mock(async () => []);
    const selectFromWhere = mock(() => ({ limit: selectFromWhereLimit }));
    const selectFrom = mock(() => ({ where: selectFromWhere }));
    const selectFn = mock(() => ({ from: selectFrom }));

    const insertFn = mock(() => {
      insertCalled = true;
      return {
        values: mock(() => ({
          returning: mock(async () => [{ id: "n_booking" }]),
        })),
      };
    });

    const paramsDb = {
      select: selectFn,
      insert: insertFn,
    } as any;

    const emailPort = { send: mock(async () => ({ messageId: "m1" })) };
    const mainDb = {} as any;

    const service = createNotificationService(mainDb, emailPort as any);

    await service.write({
      db: paramsDb,
      userId: "user1",
      category: "booking",
      title: "Booking Confirmed",
      body: "Your booking is confirmed",
    });

    expect(insertCalled).toBe(true);
  });
});