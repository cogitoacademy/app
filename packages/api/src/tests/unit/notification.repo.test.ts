import { describe, test, expect, mock } from "bun:test";
import {
  findNotificationByEventKey,
  findNotificationByIdForUser,
  insertNotification,
  findUserEmail,
  insertDispatch,
  updateDispatchStatusById,
  listPendingDispatches,
  incrementDispatchAttempts,
  findNotificationById,
  listNotifications,
  countUnread,
  updateReadStatus,
  markAllRead,
  createNotificationRepo,
} from "../../modules/notification/notification.repo";

describe("findNotificationByEventKey", () => {
  test("returns row when found", async () => {
    const limit = mock(async () => [{ id: "n1" }]);
    const where = mock(() => ({ limit }));
    const from = mock(() => ({ where }));
    const select = mock(() => ({ from }));
    const conn = { select } as any;

    const result = await findNotificationByEventKey(conn, "booking.b1.created");
    expect(result).toEqual({ id: "n1" });
    expect(select).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledTimes(1);
    expect(where).toHaveBeenCalledTimes(1);
    expect(limit).toHaveBeenCalledTimes(1);
  });

  test("returns null when not found", async () => {
    const limit = mock(async () => []);
    const where = mock(() => ({ limit }));
    const from = mock(() => ({ where }));
    const select = mock(() => ({ from }));
    const conn = { select } as any;

    const result = await findNotificationByEventKey(conn, "nonexistent");
    expect(result).toBeNull();
  });
});

describe("findNotificationByIdForUser", () => {
  test("returns notification when found for user", async () => {
    const limit = mock(async () => [{ id: "n1" }]);
    const where = mock(() => ({ limit }));
    const from = mock(() => ({ where }));
    const select = mock(() => ({ from }));
    const conn = { select } as any;

    const result = await findNotificationByIdForUser(conn, "n1", "u1");
    expect(result).toEqual({ id: "n1" });
  });

  test("returns null when not found for user", async () => {
    const limit = mock(async () => []);
    const where = mock(() => ({ limit }));
    const from = mock(() => ({ where }));
    const select = mock(() => ({ from }));
    const conn = { select } as any;

    const result = await findNotificationByIdForUser(conn, "n1", "u1");
    expect(result).toBeNull();
  });
});

describe("insertNotification", () => {
  test("inserts and returns notification", async () => {
    const inserted = { id: "n1", userId: "u1" };
    const returning = mock(async () => [inserted]);
    const values = mock(() => ({ returning }));
    const insertFn = mock(() => ({ values }));
    const conn = { insert: insertFn } as any;

    const result = await insertNotification(conn, {
      userId: "u1",
      bookingId: null,
      category: "booking",
      title: "Test",
      body: "Body",
      severity: "info",
      eventKey: "test.1",
      metadata: {},
    });

    expect(result).toEqual(inserted);
    expect(insertFn).toHaveBeenCalledTimes(1);
  });
});

describe("findUserEmail", () => {
  test("returns email when user found", async () => {
    const limit = mock(async () => [{ email: "user@example.com" }]);
    const where = mock(() => ({ limit }));
    const from = mock(() => ({ where }));
    const select = mock(() => ({ from }));
    const conn = { select } as any;

    const result = await findUserEmail(conn, "u1");
    expect(result).toBe("user@example.com");
  });

  test("returns empty string when user not found", async () => {
    const limit = mock(async () => []);
    const where = mock(() => ({ limit }));
    const from = mock(() => ({ where }));
    const select = mock(() => ({ from }));
    const conn = { select } as any;

    const result = await findUserEmail(conn, "nonexistent");
    expect(result).toBe("");
  });
});

describe("insertDispatch", () => {
  test("inserts dispatch record", async () => {
    const values = mock(async () => {});
    const insertFn = mock(() => ({ values }));
    const conn = { insert: insertFn } as any;

    await insertDispatch(conn, {
      notificationId: "n1",
      channel: "email",
      recipientEmail: "user@example.com",
      status: "queued",
    });

    expect(insertFn).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledTimes(1);
  });
});

describe("updateDispatchStatusById", () => {
  test("updates dispatch status by row id", async () => {
    const where = mock(async () => {});
    const set = mock(() => ({ where }));
    const updateFn = mock(() => ({ set }));
    const conn = { update: updateFn } as any;

    await updateDispatchStatusById(conn, "d1", "sent");

    expect(updateFn).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledTimes(1);
    expect(where).toHaveBeenCalledTimes(1);
  });
});

describe("listPendingDispatches", () => {
  test("returns pending rows (queued or failed with retries left) oldest first with a limit", async () => {
    const rows = [{ id: "d1" }, { id: "d2" }];
    const limit = mock(async () => rows);
    const orderBy = mock(() => ({ limit }));
    const where = mock(() => ({ orderBy }));
    const from = mock(() => ({ where }));
    const select = mock(() => ({ from }));
    const conn = { select } as any;

    const result = await listPendingDispatches(conn, 25);
    expect(result).toEqual(rows);
    expect(where).toHaveBeenCalledTimes(1);
    expect(orderBy).toHaveBeenCalledTimes(1);
    expect(limit).toHaveBeenCalledWith(25);
  });
});

describe("incrementDispatchAttempts", () => {
  test("increments attempts and records the last error", async () => {
    const where = mock(async () => {});
    const set = mock(() => ({ where }));
    const updateFn = mock(() => ({ set }));
    const conn = { update: updateFn } as any;

    await incrementDispatchAttempts(conn, "d1", "boom");

    expect(updateFn).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledTimes(1);
    expect(where).toHaveBeenCalledTimes(1);
  });
});

describe("findNotificationById", () => {
  test("returns the row when found", async () => {
    const limit = mock(async () => [{ id: "n1", title: "T" }]);
    const where = mock(() => ({ limit }));
    const from = mock(() => ({ where }));
    const select = mock(() => ({ from }));
    const conn = { select } as any;

    const result = await findNotificationById(conn, "n1");
    expect(result).toEqual({ id: "n1", title: "T" });
  });

  test("returns null when not found", async () => {
    const limit = mock(async () => []);
    const where = mock(() => ({ limit }));
    const from = mock(() => ({ where }));
    const select = mock(() => ({ from }));
    const conn = { select } as any;

    const result = await findNotificationById(conn, "missing");
    expect(result).toBeNull();
  });
});

describe("listNotifications", () => {
  test("returns rows from select", async () => {
    const rows = [
      { id: "n1", createdAt: new Date() },
      { id: "n2", createdAt: new Date() },
    ];
    const limit = mock(async () => rows);
    const orderBy = mock(() => ({ limit }));
    const where = mock(() => ({ orderBy }));
    const from = mock(() => ({ where }));
    const select = mock(() => ({ from }));
    const conn = { select } as any;

    const result = await listNotifications(conn, "u1", { limit: 5 });
    expect(result).toEqual(rows);
  });

  test("passes unreadOnly flag", async () => {
    const limit = mock(async () => []);
    const orderBy = mock(() => ({ limit }));
    const where = mock(() => ({ orderBy }));
    const from = mock(() => ({ where }));
    const select = mock(() => ({ from }));
    const conn = { select } as any;

    await listNotifications(conn, "u1", { unreadOnly: true, limit: 5 });
    expect(select).toHaveBeenCalledTimes(1);
    expect(where).toHaveBeenCalledTimes(1);
  });
});

describe("countUnread", () => {
  test("returns count from database", async () => {
    const where = mock(async () => [{ value: 7 }]);
    const from = mock(() => ({ where }));
    const select = mock(() => ({ from }));
    const conn = { select } as any;

    const result = await countUnread(conn, "u1");
    expect(result).toBe(7);
  });

  test("returns 0 when no rows", async () => {
    const where = mock(async () => []);
    const from = mock(() => ({ where }));
    const select = mock(() => ({ from }));
    const conn = { select } as any;

    const result = await countUnread(conn, "u1");
    expect(result).toBe(0);
  });
});

describe("updateReadStatus", () => {
  test("updates notification read status", async () => {
    const where = mock(async () => {});
    const set = mock(() => ({ where }));
    const updateFn = mock(() => ({ set }));
    const conn = { update: updateFn } as any;

    await updateReadStatus(conn, "n1", "u1", true);
    expect(updateFn).toHaveBeenCalledTimes(1);
  });
});

describe("markAllRead", () => {
  test("marks all unread notifications as read", async () => {
    const where = mock(async () => {});
    const set = mock(() => ({ where }));
    const updateFn = mock(() => ({ set }));
    const conn = { update: updateFn } as any;

    await markAllRead(conn, "u1");
    expect(updateFn).toHaveBeenCalledTimes(1);
  });
});

describe("createNotificationRepo", () => {
  test("returns object with all repo methods", () => {
    const db = {} as any;
    const repo = createNotificationRepo(db);

    expect(typeof repo.findNotificationByEventKey).toBe("function");
    expect(typeof repo.insertNotification).toBe("function");
    expect(typeof repo.findUserEmail).toBe("function");
    expect(typeof repo.insertDispatch).toBe("function");
    expect(typeof repo.listNotifications).toBe("function");
    expect(typeof repo.countUnread).toBe("function");
    expect(typeof repo.updateReadStatus).toBe("function");
    expect(typeof repo.markAllRead).toBe("function");
    expect(typeof repo.findNotificationByIdForUser).toBe("function");
  });

  test("findNotificationByIdForUser delegates to standalone function", async () => {
    const limit = mock(async () => [{ id: "n1" }]);
    const where = mock(() => ({ limit }));
    const from = mock(() => ({ where }));
    const select = mock(() => ({ from }));
    const db = { select } as any;

    const repo = createNotificationRepo(db);
    const result = await repo.findNotificationByIdForUser("n1", "u1");
    expect(result).toEqual({ id: "n1" });
  });

  test("listNotifications delegates with correct defaults", async () => {
    const rows = [{ id: "n1" }];
    const limit = mock(async () => rows);
    const orderBy = mock(() => ({ limit }));
    const where = mock(() => ({ orderBy }));
    const from = mock(() => ({ where }));
    const select = mock(() => ({ from }));
    const db = { select } as any;

    const repo = createNotificationRepo(db);
    const result = await repo.listNotifications("u1", { limit: 5 });
    expect(result).toEqual(rows);
  });

  test("countUnread delegates to standalone function", async () => {
    const where = mock(async () => [{ value: 3 }]);
    const from = mock(() => ({ where }));
    const select = mock(() => ({ from }));
    const db = { select } as any;

    const repo = createNotificationRepo(db);
    const result = await repo.countUnread("u1");
    expect(result).toBe(3);
  });

  test("updateReadStatus delegates to standalone function", async () => {
    const where = mock(async () => {});
    const set = mock(() => ({ where }));
    const update = mock(() => ({ set }));
    const db = { update } as any;

    const repo = createNotificationRepo(db);
    await repo.updateReadStatus("n1", "u1", true);
    expect(update).toHaveBeenCalledTimes(1);
  });

  test("markAllRead delegates to standalone function", async () => {
    const where = mock(async () => {});
    const set = mock(() => ({ where }));
    const update = mock(() => ({ set }));
    const db = { update } as any;

    const repo = createNotificationRepo(db);
    await repo.markAllRead("u1");
    expect(update).toHaveBeenCalledTimes(1);
  });
});
