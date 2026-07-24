import { describe, test, expect, mock } from "bun:test";
import {
  findNotificationByEventKey,
  insertNotification,
  findUserEmail,
  insertDispatch,
  updateDispatchStatus,
  listNotifications,
  countUnread,
  updateReadStatus,
  markAllRead,
  findDispatch,
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

describe("updateDispatchStatus", () => {
  test("updates dispatch status", async () => {
    const where = mock(async () => {});
    const set = mock(() => ({ where }));
    const updateFn = mock(() => ({ set }));
    const conn = { update: updateFn } as any;

    await updateDispatchStatus(conn, "n1", "sent");

    expect(updateFn).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledTimes(1);
    expect(where).toHaveBeenCalledTimes(1);
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

describe("findDispatch", () => {
  test("returns dispatch when found", async () => {
    const dispatch = { id: "d1", notificationId: "n1", status: "sent" };
    const limit = mock(async () => [dispatch]);
    const where = mock(() => ({ limit }));
    const from = mock(() => ({ where }));
    const select = mock(() => ({ from }));
    const conn = { select } as any;

    const result = await findDispatch(conn, "n1");
    expect(result).toEqual(dispatch);
  });

  test("returns null when not found", async () => {
    const limit = mock(async () => []);
    const where = mock(() => ({ limit }));
    const from = mock(() => ({ where }));
    const select = mock(() => ({ from }));
    const conn = { select } as any;

    const result = await findDispatch(conn, "nonexistent");
    expect(result).toBeNull();
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
    expect(typeof repo.updateDispatchStatus).toBe("function");
    expect(typeof repo.listNotifications).toBe("function");
    expect(typeof repo.countUnread).toBe("function");
    expect(typeof repo.updateReadStatus).toBe("function");
    expect(typeof repo.markAllRead).toBe("function");
    expect(typeof repo.findDispatch).toBe("function");
  });
});
