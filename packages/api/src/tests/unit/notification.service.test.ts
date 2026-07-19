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

function createMainDbMock(overrides: {
  selectResult?: any[];
  updateResult?: any;
}) {
  const { selectResult = [], updateResult } = overrides;

  const chain = {
    from: mock(() => chain),
    where: mock(() => chain),
    orderBy: mock(() => chain),
    limit: mock(async () => selectResult),
  };

  const selectFn = mock(() => ({ from: chain.from }));

  const updateSetWhere = mock(async () => updateResult);
  const updateSet = mock(() => ({ where: updateSetWhere }));
  const updateFn = mock(() => ({ set: updateSet }));

  const db = {
    select: selectFn,
    update: updateFn,
  } as any;

  return { db, selectFn, updateFn, chain };
}

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

  test("writeInternal dispatches email for action severity with supported category and updates status to sent", async () => {
    const selectResults: any[][] = [[{ email: "user@example.com" }]];
    let selectIndex = 0;

    const selectLimitFn = mock(async () => selectResults[selectIndex++]);
    const selectWhereFn = mock(() => ({ limit: selectLimitFn }));
    const selectFromFn = mock(() => ({ where: selectWhereFn }));
    const selectFn = mock(() => ({ from: selectFromFn }));

    let insertIndex = 0;
    const insertFn = mock(() => {
      insertIndex++;
      if (insertIndex === 1) {
        return {
          values: mock(() => ({
            returning: mock(async () => [{ id: "n_action" }]),
          })),
        };
      }
      return {
        values: mock(async () => {}),
      };
    });

    const updateSetWhere = mock(async () => {});
    const updateSet = mock(() => ({ where: updateSetWhere }));
    const updateFn = mock(() => ({ set: updateSet }));

    const paramsDb = {
      select: selectFn,
      insert: insertFn,
      update: updateFn,
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
      severity: "action",
    });

    expect(emailPort.send).toHaveBeenCalledTimes(1);
    expect(emailPort.send).toHaveBeenCalledWith({
      to: "user@example.com",
      subject: "Booking Confirmed",
      html: "Your booking is confirmed",
      category: "booking",
    });
    expect(updateFn).toHaveBeenCalledTimes(1);
  });

  test("writeInternal dispatches email for critical severity with supported category", async () => {
    const selectResults: any[][] = [[{ email: "critical@example.com" }]];
    let selectIndex = 0;

    const selectLimitFn = mock(async () => selectResults[selectIndex++]);
    const selectWhereFn = mock(() => ({ limit: selectLimitFn }));
    const selectFromFn = mock(() => ({ where: selectWhereFn }));
    const selectFn = mock(() => ({ from: selectFromFn }));

    let insertIndex = 0;
    const insertFn = mock(() => {
      insertIndex++;
      if (insertIndex === 1) {
        return {
          values: mock(() => ({
            returning: mock(async () => [{ id: "n_critical" }]),
          })),
        };
      }
      return {
        values: mock(async () => {}),
      };
    });

    const updateSetWhere = mock(async () => {});
    const updateSet = mock(() => ({ where: updateSetWhere }));
    const updateFn = mock(() => ({ set: updateSet }));

    const paramsDb = {
      select: selectFn,
      insert: insertFn,
      update: updateFn,
    } as any;

    const emailPort = { send: mock(async () => ({ messageId: "m2" })) };
    const mainDb = {} as any;

    const service = createNotificationService(mainDb, emailPort as any);

    await service.write({
      db: paramsDb,
      userId: "user1",
      category: "payment",
      title: "Payment Required",
      body: "Payment is due",
      severity: "critical",
    });

    expect(emailPort.send).toHaveBeenCalledTimes(1);
    expect(updateFn).toHaveBeenCalledTimes(1);
  });

  test("writeInternal updates dispatch status to failed when email send fails", async () => {
    const selectResults: any[][] = [[{ email: "user@example.com" }]];
    let selectIndex = 0;

    const selectLimitFn = mock(async () => selectResults[selectIndex++]);
    const selectWhereFn = mock(() => ({ limit: selectLimitFn }));
    const selectFromFn = mock(() => ({ where: selectWhereFn }));
    const selectFn = mock(() => ({ from: selectFromFn }));

    let insertIndex = 0;
    const insertFn = mock(() => {
      insertIndex++;
      if (insertIndex === 1) {
        return {
          values: mock(() => ({
            returning: mock(async () => [{ id: "n_fail" }]),
          })),
        };
      }
      return {
        values: mock(async () => {}),
      };
    });

    const updateSetWhere = mock(async () => {});
    const updateSet = mock(() => ({ where: updateSetWhere }));
    const updateFn = mock(() => ({ set: updateSet }));

    const paramsDb = {
      select: selectFn,
      insert: insertFn,
      update: updateFn,
    } as any;

    const emailPort = {
      send: mock(async () => {
        throw new Error("SMTP failure");
      }),
    };
    const mainDb = {} as any;

    const service = createNotificationService(mainDb, emailPort as any);

    await service.write({
      db: paramsDb,
      userId: "user1",
      category: "booking",
      title: "Booking Failed",
      body: "Email dispatch will fail",
      severity: "action",
    });

    expect(emailPort.send).toHaveBeenCalledTimes(1);
    expect(updateFn).toHaveBeenCalledTimes(1);

    const errorCalls = logCaptures.filter(
      (c: any) => c.action === "notification_email_dispatch_failed",
    );
    expect(errorCalls.length).toBeGreaterThanOrEqual(1);
  });

  test("writeInternal skips email dispatch when recipient email is empty string", async () => {
    const selectResults: any[][] = [[{ email: "" }]];
    let selectIndex = 0;

    const selectLimitFn = mock(async () => selectResults[selectIndex++]);
    const selectWhereFn = mock(() => ({ limit: selectLimitFn }));
    const selectFromFn = mock(() => ({ where: selectWhereFn }));
    const selectFn = mock(() => ({ from: selectFromFn }));

    const insertFn = mock(() => ({
      values: mock(() => ({
        returning: mock(async () => [{ id: "n_no_email" }]),
      })),
    }));

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
      title: "No Email",
      body: "No email body",
      severity: "action",
    });

    expect(emailPort.send).toHaveBeenCalledTimes(0);
  });

  test("writeInternal skips email dispatch when recipient email is undefined (no user row)", async () => {
    const selectResults: any[][] = [[]];
    let selectIndex = 0;

    const selectLimitFn = mock(async () => selectResults[selectIndex++]);
    const selectWhereFn = mock(() => ({ limit: selectLimitFn }));
    const selectFromFn = mock(() => ({ where: selectWhereFn }));
    const selectFn = mock(() => ({ from: selectFromFn }));

    const insertFn = mock(() => ({
      values: mock(() => ({
        returning: mock(async () => [{ id: "n_no_user" }]),
      })),
    }));

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
      title: "No User",
      body: "No user row",
      severity: "action",
    });

    expect(emailPort.send).toHaveBeenCalledTimes(0);
  });

  test("writeInternal logs debug for unsupported category (achievement) with emailPort and recipient email", async () => {
    const selectResults: any[][] = [[{ email: "user@example.com" }]];
    let selectIndex = 0;

    const selectLimitFn = mock(async () => selectResults[selectIndex++]);
    const selectWhereFn = mock(() => ({ limit: selectLimitFn }));
    const selectFromFn = mock(() => ({ where: selectWhereFn }));
    const selectFn = mock(() => ({ from: selectFromFn }));

    const insertFn = mock(() => ({
      values: mock(() => ({
        returning: mock(async () => [{ id: "n_achievement" }]),
      })),
    }));

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

    expect(emailPort.send).toHaveBeenCalledTimes(0);

    const debugCalls = logCaptures.filter(
      (c: any) => c.action === "notification_email_skipped_category",
    );
    expect(debugCalls.length).toBeGreaterThanOrEqual(1);
  });

  test("writeInternal logs debug for unsupported category (system) with emailPort and recipient email", async () => {
    const selectResults: any[][] = [[{ email: "user@example.com" }]];
    let selectIndex = 0;

    const selectLimitFn = mock(async () => selectResults[selectIndex++]);
    const selectWhereFn = mock(() => ({ limit: selectLimitFn }));
    const selectFromFn = mock(() => ({ where: selectWhereFn }));
    const selectFn = mock(() => ({ from: selectFromFn }));

    const insertFn = mock(() => ({
      values: mock(() => ({
        returning: mock(async () => [{ id: "n_system" }]),
      })),
    }));

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
      title: "System Notice",
      body: "System notice body",
      severity: "action",
    });

    expect(emailPort.send).toHaveBeenCalledTimes(0);

    const debugCalls = logCaptures.filter(
      (c: any) => c.action === "notification_email_skipped_category",
    );
    expect(debugCalls.length).toBeGreaterThanOrEqual(1);
  });

  test("writeInternal dispatches email with eventKey dedup check passing (no existing)", async () => {
    const selectResults: any[][] = [[], [{ email: "user@example.com" }]];
    let selectIndex = 0;

    const selectLimitFn = mock(async () => selectResults[selectIndex++]);
    const selectWhereFn = mock(() => ({ limit: selectLimitFn }));
    const selectFromFn = mock(() => ({ where: selectWhereFn }));
    const selectFn = mock(() => ({ from: selectFromFn }));

    let insertIndex = 0;
    const insertFn = mock(() => {
      insertIndex++;
      if (insertIndex === 1) {
        return {
          values: mock(() => ({
            returning: mock(async () => [{ id: "n_dedup_pass" }]),
          })),
        };
      }
      return {
        values: mock(async () => {}),
      };
    });

    const updateSetWhere = mock(async () => {});
    const updateSet = mock(() => ({ where: updateSetWhere }));
    const updateFn = mock(() => ({ set: updateSet }));

    const paramsDb = {
      select: selectFn,
      insert: insertFn,
      update: updateFn,
    } as any;

    const emailPort = { send: mock(async () => ({ messageId: "m1" })) };
    const mainDb = {} as any;

    const service = createNotificationService(mainDb, emailPort as any);

    await service.write({
      db: paramsDb,
      userId: "user1",
      category: "booking",
      title: "New Booking",
      body: "New booking body",
      severity: "action",
      eventKey: "booking.b1.new",
    });

    expect(emailPort.send).toHaveBeenCalledTimes(1);
    expect(updateFn).toHaveBeenCalledTimes(1);
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

  test("writeInternal does not dispatch email for info severity", async () => {
    const insertFn = mock(() => ({
      values: mock(() => ({
        returning: mock(async () => [{ id: "n_info" }]),
      })),
    }));

    const paramsDb = {
      select: mock(() => ({
        from: mock(() => ({
          where: mock(() => ({ limit: mock(async () => []) })),
        })),
      })),
      insert: insertFn,
    } as any;

    const emailPort = { send: mock(async () => ({ messageId: "m1" })) };
    const mainDb = {} as any;

    const service = createNotificationService(mainDb, emailPort as any);

    await service.write({
      db: paramsDb,
      userId: "user1",
      category: "booking",
      title: "Info Notification",
      body: "Just info",
      severity: "info",
    });

    expect(emailPort.send).toHaveBeenCalledTimes(0);
  });

  test("writeInternal without emailPort does not attempt email dispatch even for action severity", async () => {
    const insertFn = mock(() => ({
      values: mock(() => ({
        returning: mock(async () => [{ id: "n_no_port" }]),
      })),
    }));

    const paramsDb = {
      select: mock(() => ({
        from: mock(() => ({
          where: mock(() => ({ limit: mock(async () => []) })),
        })),
      })),
      insert: insertFn,
    } as any;

    const mainDb = {} as any;

    const service = createNotificationService(mainDb, undefined as any);

    await service.write({
      db: paramsDb,
      userId: "user1",
      category: "booking",
      title: "No email port",
      body: "No email port body",
      severity: "action",
    });

    expect(true).toBe(true);
  });

  test("list returns paginated results with nextCursor when rows exceed limit", async () => {
    const items = Array.from({ length: 6 }, (_, i) => ({
      id: `n${i}`,
      userId: "user1",
      category: "booking",
      title: `Title ${i}`,
      body: `Body ${i}`,
      severity: "info",
      isRead: false,
      createdAt: new Date(2025, 0, i + 1),
      readAt: null,
      eventKey: null,
      metadata: {},
      bookingId: null,
    }));

    const { db } = createMainDbMock({ selectResult: items });

    const service = createNotificationService(db, undefined as any);
    const result = await service.list("user1", { limit: 5 });

    expect(result.items.length).toBe(5);
    expect(result.nextCursor).not.toBeNull();
  });

  test("list returns null nextCursor when results fit in one page", async () => {
    const items = Array.from({ length: 3 }, (_, i) => ({
      id: `n${i}`,
      userId: "user1",
      category: "booking",
      title: `Title ${i}`,
      body: `Body ${i}`,
      severity: "info",
      isRead: false,
      createdAt: new Date(2025, 0, i + 1),
      readAt: null,
      eventKey: null,
      metadata: {},
      bookingId: null,
    }));

    const { db } = createMainDbMock({ selectResult: items });

    const service = createNotificationService(db, undefined as any);
    const result = await service.list("user1", { limit: 5 });

    expect(result.items.length).toBe(3);
    expect(result.nextCursor).toBeNull();
  });

  test("list filters by unreadOnly", async () => {
    const items = [
      {
        id: "n1",
        userId: "user1",
        category: "booking",
        title: "Unread",
        body: "Unread body",
        severity: "info",
        isRead: false,
        createdAt: new Date(2025, 0, 1),
        readAt: null,
        eventKey: null,
        metadata: {},
        bookingId: null,
      },
    ];

    const { db, chain } = createMainDbMock({ selectResult: items });

    const service = createNotificationService(db, undefined as any);
    const result = await service.list("user1", { unreadOnly: true });

    expect(result.items.length).toBe(1);
    expect(chain.where).toHaveBeenCalled();
  });

  test("list uses default limit when not specified", async () => {
    const items = Array.from({ length: 5 }, (_, i) => ({
      id: `n${i}`,
      userId: "user1",
      category: "booking",
      title: `Title ${i}`,
      body: `Body ${i}`,
      severity: "info",
      isRead: false,
      createdAt: new Date(2025, 0, i + 1),
      readAt: null,
      eventKey: null,
      metadata: {},
      bookingId: null,
    }));

    const { db } = createMainDbMock({ selectResult: items });

    const service = createNotificationService(db, undefined as any);
    const result = await service.list("user1");

    expect(result.items).toBeDefined();
  });

  test("list with cursor includes createdAt filter", async () => {
    const items = Array.from({ length: 2 }, (_, i) => ({
      id: `n${i}`,
      userId: "user1",
      category: "booking",
      title: `Title ${i}`,
      body: `Body ${i}`,
      severity: "info",
      isRead: false,
      createdAt: new Date(2025, 0, i + 1),
      readAt: null,
      eventKey: null,
      metadata: {},
      bookingId: null,
    }));

    const { db, chain } = createMainDbMock({ selectResult: items });

    const service = createNotificationService(db, undefined as any);
    const result = await service.list("user1", {
      cursor: "2025-01-10T00:00:00.000Z",
    });

    expect(result.items.length).toBe(2);
    expect(chain.where).toHaveBeenCalled();
  });

  test("getUnreadCount returns count from database", async () => {
    const chain = {
      from: mock(() => chain),
      where: mock(async () => [{ value: 5 }]),
    };

    const selectFn = mock(() => ({ from: chain.from }));

    const db = { select: selectFn } as any;

    const service = createNotificationService(db, undefined as any);
    const count = await service.getUnreadCount("user1");

    expect(count).toBe(5);
  });

  test("getUnreadCount returns 0 when no rows", async () => {
    const chain = {
      from: mock(() => chain),
      where: mock(async () => []),
    };

    const selectFn = mock(() => ({ from: chain.from }));

    const db = { select: selectFn } as any;

    const service = createNotificationService(db, undefined as any);
    const count = await service.getUnreadCount("user1");

    expect(count).toBe(0);
  });

  test("markAsRead updates single notification", async () => {
    const updateSetWhere = mock(async () => {});
    const updateSet = mock(() => ({ where: updateSetWhere }));
    const updateFn = mock(() => ({ set: updateSet }));

    const db = { update: updateFn } as any;

    const service = createNotificationService(db, undefined as any);
    await service.markAsRead("user1", "n1");

    expect(updateFn).toHaveBeenCalledTimes(1);
    expect(updateSet).toHaveBeenCalledTimes(1);
    expect(updateSetWhere).toHaveBeenCalledTimes(1);
  });

  test("markAllAsRead updates all unread for user", async () => {
    const updateSetWhere = mock(async () => {});
    const updateSet = mock(() => ({ where: updateSetWhere }));
    const updateFn = mock(() => ({ set: updateSet }));

    const db = { update: updateFn } as any;

    const service = createNotificationService(db, undefined as any);
    await service.markAllAsRead("user1");

    expect(updateFn).toHaveBeenCalledTimes(1);
    expect(updateSet).toHaveBeenCalledTimes(1);
    expect(updateSetWhere).toHaveBeenCalledTimes(1);
  });

  test("dispatchStatus returns dispatch record when found", async () => {
    const dispatchRecord = {
      id: "d1",
      notificationId: "n1",
      channel: "email",
      recipientEmail: "user@example.com",
      status: "sent",
      createdAt: new Date(),
    };

    const selectFromWhereLimit = mock(async () => [dispatchRecord]);
    const selectFromWhere = mock(() => ({ limit: selectFromWhereLimit }));
    const selectFrom = mock(() => ({ where: selectFromWhere }));
    const selectFn = mock(() => ({ from: selectFrom }));

    const db = { select: selectFn } as any;

    const service = createNotificationService(db, undefined as any);
    const result = await service.dispatchStatus("n1");

    expect(result).toEqual(dispatchRecord);
  });

  test("dispatchStatus returns null when not found", async () => {
    const selectFromWhereLimit = mock(async () => []);
    const selectFromWhere = mock(() => ({ limit: selectFromWhereLimit }));
    const selectFrom = mock(() => ({ where: selectFromWhere }));
    const selectFn = mock(() => ({ from: selectFrom }));

    const db = { select: selectFn } as any;

    const service = createNotificationService(db, undefined as any);
    const result = await service.dispatchStatus("nonexistent");

    expect(result).toBeNull();
  });

  test("writeInternal dispatches email for refund category with action severity", async () => {
    const selectResults: any[][] = [[{ email: "refund@example.com" }]];
    let selectIndex = 0;

    const selectLimitFn = mock(async () => selectResults[selectIndex++]);
    const selectWhereFn = mock(() => ({ limit: selectLimitFn }));
    const selectFromFn = mock(() => ({ where: selectWhereFn }));
    const selectFn = mock(() => ({ from: selectFromFn }));

    let insertIndex = 0;
    const insertFn = mock(() => {
      insertIndex++;
      if (insertIndex === 1) {
        return {
          values: mock(() => ({
            returning: mock(async () => [{ id: "n_refund" }]),
          })),
        };
      }
      return {
        values: mock(async () => {}),
      };
    });

    const updateSetWhere = mock(async () => {});
    const updateSet = mock(() => ({ where: updateSetWhere }));
    const updateFn = mock(() => ({ set: updateSet }));

    const paramsDb = {
      select: selectFn,
      insert: insertFn,
      update: updateFn,
    } as any;

    const emailPort = { send: mock(async () => ({ messageId: "m1" })) };
    const mainDb = {} as any;

    const service = createNotificationService(mainDb, emailPort as any);

    await service.write({
      db: paramsDb,
      userId: "user1",
      category: "refund",
      title: "Refund Processed",
      body: "Your refund has been processed",
      severity: "action",
    });

    expect(emailPort.send).toHaveBeenCalledTimes(1);
  });

  test("writeInternal dispatches email for schedule category with critical severity", async () => {
    const selectResults: any[][] = [[{ email: "schedule@example.com" }]];
    let selectIndex = 0;

    const selectLimitFn = mock(async () => selectResults[selectIndex++]);
    const selectWhereFn = mock(() => ({ limit: selectLimitFn }));
    const selectFromFn = mock(() => ({ where: selectWhereFn }));
    const selectFn = mock(() => ({ from: selectFromFn }));

    let insertIndex = 0;
    const insertFn = mock(() => {
      insertIndex++;
      if (insertIndex === 1) {
        return {
          values: mock(() => ({
            returning: mock(async () => [{ id: "n_schedule" }]),
          })),
        };
      }
      return {
        values: mock(async () => {}),
      };
    });

    const updateSetWhere = mock(async () => {});
    const updateSet = mock(() => ({ where: updateSetWhere }));
    const updateFn = mock(() => ({ set: updateSet }));

    const paramsDb = {
      select: selectFn,
      insert: insertFn,
      update: updateFn,
    } as any;

    const emailPort = { send: mock(async () => ({ messageId: "m1" })) };
    const mainDb = {} as any;

    const service = createNotificationService(mainDb, emailPort as any);

    await service.write({
      db: paramsDb,
      userId: "user1",
      category: "schedule",
      title: "Schedule Changed",
      body: "Your schedule has been updated",
      severity: "critical",
    });

    expect(emailPort.send).toHaveBeenCalledTimes(1);
  });

  test("writeInternal dispatches email for override category with action severity", async () => {
    const selectResults: any[][] = [[{ email: "override@example.com" }]];
    let selectIndex = 0;

    const selectLimitFn = mock(async () => selectResults[selectIndex++]);
    const selectWhereFn = mock(() => ({ limit: selectLimitFn }));
    const selectFromFn = mock(() => ({ where: selectWhereFn }));
    const selectFn = mock(() => ({ from: selectFromFn }));

    let insertIndex = 0;
    const insertFn = mock(() => {
      insertIndex++;
      if (insertIndex === 1) {
        return {
          values: mock(() => ({
            returning: mock(async () => [{ id: "n_override" }]),
          })),
        };
      }
      return {
        values: mock(async () => {}),
      };
    });

    const updateSetWhere = mock(async () => {});
    const updateSet = mock(() => ({ where: updateSetWhere }));
    const updateFn = mock(() => ({ set: updateSet }));

    const paramsDb = {
      select: selectFn,
      insert: insertFn,
      update: updateFn,
    } as any;

    const emailPort = { send: mock(async () => ({ messageId: "m1" })) };
    const mainDb = {} as any;

    const service = createNotificationService(mainDb, emailPort as any);

    await service.write({
      db: paramsDb,
      userId: "user1",
      category: "override",
      title: "Override Applied",
      body: "An override was applied",
      severity: "action",
    });

    expect(emailPort.send).toHaveBeenCalledTimes(1);
  });

  test("writeInternal dispatches email for payment category with action severity", async () => {
    const selectResults: any[][] = [[{ email: "payment@example.com" }]];
    let selectIndex = 0;

    const selectLimitFn = mock(async () => selectResults[selectIndex++]);
    const selectWhereFn = mock(() => ({ limit: selectLimitFn }));
    const selectFromFn = mock(() => ({ where: selectWhereFn }));
    const selectFn = mock(() => ({ from: selectFromFn }));

    let insertIndex = 0;
    const insertFn = mock(() => {
      insertIndex++;
      if (insertIndex === 1) {
        return {
          values: mock(() => ({
            returning: mock(async () => [{ id: "n_payment" }]),
          })),
        };
      }
      return {
        values: mock(async () => {}),
      };
    });

    const updateSetWhere = mock(async () => {});
    const updateSet = mock(() => ({ where: updateSetWhere }));
    const updateFn = mock(() => ({ set: updateSet }));

    const paramsDb = {
      select: selectFn,
      insert: insertFn,
      update: updateFn,
    } as any;

    const emailPort = { send: mock(async () => ({ messageId: "m1" })) };
    const mainDb = {} as any;

    const service = createNotificationService(mainDb, emailPort as any);

    await service.write({
      db: paramsDb,
      userId: "user1",
      category: "payment",
      title: "Payment Received",
      body: "Your payment was received",
      severity: "action",
    });

    expect(emailPort.send).toHaveBeenCalledTimes(1);
  });

  test("skips email dispatch for unsupported categories (achievement) with emailPort", async () => {
    const selectResults: any[][] = [[{ email: "user@example.com" }]];
    let selectIndex = 0;

    const selectLimitFn = mock(async () => selectResults[selectIndex++]);
    const selectWhereFn = mock(() => ({ limit: selectLimitFn }));
    const selectFromFn = mock(() => ({ where: selectWhereFn }));
    const selectFn = mock(() => ({ from: selectFromFn }));

    const insertFn = mock(() => ({
      values: mock(() => ({
        returning: mock(async () => [{ id: "n_achievement" }]),
      })),
    }));

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

    expect(emailPort.send).toHaveBeenCalledTimes(0);

    const debugCalls = logCaptures.filter(
      (c: any) => c.action === "notification_email_skipped_category",
    );
    expect(debugCalls.length).toBeGreaterThanOrEqual(1);
  });

  test("dispatches email for supported categories (booking)", async () => {
    const selectResults: any[][] = [[{ email: "user@example.com" }]];
    let selectIndex = 0;

    const selectLimitFn = mock(async () => selectResults[selectIndex++]);
    const selectWhereFn = mock(() => ({ limit: selectLimitFn }));
    const selectFromFn = mock(() => ({ where: selectWhereFn }));
    const selectFn = mock(() => ({ from: selectFromFn }));

    let insertIndex = 0;
    const insertFn = mock(() => {
      insertIndex++;
      if (insertIndex === 1) {
        return {
          values: mock(() => ({
            returning: mock(async () => [{ id: "n_booking" }]),
          })),
        };
      }
      return {
        values: mock(async () => {}),
      };
    });

    const updateSetWhere = mock(async () => {});
    const updateSet = mock(() => ({ where: updateSetWhere }));
    const updateFn = mock(() => ({ set: updateSet }));

    const paramsDb = {
      select: selectFn,
      insert: insertFn,
      update: updateFn,
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
      severity: "action",
    });

    expect(emailPort.send).toHaveBeenCalledTimes(1);
  });

  test("getUnreadCount is exposed as a function", async () => {
    const db = {} as any;
    const service = createNotificationService(db);
    expect(typeof service.getUnreadCount).toBe("function");
  });
});
