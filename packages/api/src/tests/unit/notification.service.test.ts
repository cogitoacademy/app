import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import { createNotificationService } from "../../modules/notification/notification.service";
import { NotificationNotFoundError } from "../../modules/notification/notification.errors";
import type { NotificationRepo } from "../../modules/notification/notification.repo";

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

function makeRepo(overrides: Partial<NotificationRepo> = {}): NotificationRepo {
  return {
    findNotificationByEventKey: mock(async () => null),
    findNotificationByIdForUser: mock(async () => ({ id: "n1" })),
    insertNotification: mock(async () => ({ id: "n1" })),
    findUserEmail: mock(async () => ""),
    insertDispatch: mock(async () => {}),
    updateDispatchStatus: mock(async () => {}),
    listNotifications: mock(async () => []),
    countUnread: mock(async () => 0),
    updateReadStatus: mock(async () => {}),
    markAllRead: mock(async () => {}),
    findDispatch: mock(async () => null),
    ...overrides,
  } as any;
}

describe("NotificationService (unit)", () => {
  beforeEach(() => {
    logCaptures = [];
  });

  test("writeInternal deduplicates by eventKey when existing notification found", async () => {
    const repo = makeRepo({
      findNotificationByEventKey: mock(async () => ({ id: "existing_n1" })),
    });
    const emailPort = { send: mock(async () => ({ messageId: "m1" })) };

    const service = createNotificationService(repo, emailPort as any);

    await service.write({
      db: {} as any,
      userId: "user1",
      category: "booking",
      title: "Test",
      body: "Test body",
      eventKey: "booking.b1.created",
    });

    expect(repo.insertNotification).toHaveBeenCalledTimes(0);
  });

  test("writeInternal inserts when no eventKey provided", async () => {
    const repo = makeRepo({
      findNotificationByEventKey: mock(async () => null),
    });
    const emailPort = { send: mock(async () => ({ messageId: "m1" })) };

    const service = createNotificationService(repo, emailPort as any);

    await service.write({
      db: {} as any,
      userId: "user1",
      category: "system",
      title: "Test",
      body: "Test body",
    });

    expect(repo.insertNotification).toHaveBeenCalledTimes(1);
  });

  test("writeInternal dispatches email for action severity with supported category and updates status to sent", async () => {
    const repo = makeRepo({
      findNotificationByEventKey: mock(async () => null),
      insertNotification: mock(async () => ({ id: "n_action" })),
      findUserEmail: mock(async () => "user@example.com"),
    });
    const emailPort = { send: mock(async () => ({ messageId: "m1" })) };

    const service = createNotificationService(repo, emailPort as any);

    await service.write({
      db: {} as any,
      userId: "user1",
      category: "booking",
      title: "Booking Confirmed",
      body: "Your booking is confirmed",
      severity: "action",
      emailRequired: true,
    });

    expect(emailPort.send).toHaveBeenCalledTimes(1);
    expect(emailPort.send).toHaveBeenCalledWith({
      to: "user@example.com",
      subject: "Booking Confirmed",
      html: "Your booking is confirmed",
      category: "booking",
    });
    expect(repo.updateDispatchStatus).toHaveBeenCalledTimes(1);
  });

  test("writeInternal dispatches email for critical severity with supported category", async () => {
    const repo = makeRepo({
      findNotificationByEventKey: mock(async () => null),
      insertNotification: mock(async () => ({ id: "n_critical" })),
      findUserEmail: mock(async () => "critical@example.com"),
    });
    const emailPort = { send: mock(async () => ({ messageId: "m2" })) };

    const service = createNotificationService(repo, emailPort as any);

    await service.write({
      db: {} as any,
      userId: "user1",
      category: "payment",
      title: "Payment Required",
      body: "Payment is due",
      severity: "critical",
      emailRequired: true,
    });

    expect(emailPort.send).toHaveBeenCalledTimes(1);
    expect(repo.updateDispatchStatus).toHaveBeenCalledTimes(1);
  });

  test("writeInternal updates dispatch status to failed when email send fails", async () => {
    const repo = makeRepo({
      findNotificationByEventKey: mock(async () => null),
      insertNotification: mock(async () => ({ id: "n_fail" })),
      findUserEmail: mock(async () => "user@example.com"),
    });
    const emailPort = {
      send: mock(async () => {
        throw new Error("SMTP failure");
      }),
    };

    const service = createNotificationService(repo, emailPort as any);

    await service.write({
      db: {} as any,
      userId: "user1",
      category: "booking",
      title: "Booking Failed",
      body: "Email dispatch will fail",
      severity: "action",
      emailRequired: true,
    });

    expect(emailPort.send).toHaveBeenCalledTimes(1);
    expect(repo.updateDispatchStatus).toHaveBeenCalledWith(
      expect.anything(),
      "n_fail",
      "failed",
    );

    const errorCalls = logCaptures.filter(
      (c: any) => c.action === "notification_email_dispatch_failed",
    );
    expect(errorCalls.length).toBeGreaterThanOrEqual(1);
  });

  test("writeInternal skips email dispatch when recipient email is empty string", async () => {
    const repo = makeRepo({
      findNotificationByEventKey: mock(async () => null),
      insertNotification: mock(async () => ({ id: "n_no_email" })),
      findUserEmail: mock(async () => ""),
    });
    const emailPort = { send: mock(async () => ({ messageId: "m1" })) };

    const service = createNotificationService(repo, emailPort as any);

    await service.write({
      db: {} as any,
      userId: "user1",
      category: "booking",
      title: "No Email",
      body: "No email body",
      severity: "action",
      emailRequired: true,
    });

    expect(emailPort.send).toHaveBeenCalledTimes(0);
  });

  test("writeInternal skips email dispatch when recipient email is undefined (no user row)", async () => {
    const repo = makeRepo({
      findNotificationByEventKey: mock(async () => null),
      insertNotification: mock(async () => ({ id: "n_no_user" })),
      findUserEmail: mock(async () => ""),
    });
    const emailPort = { send: mock(async () => ({ messageId: "m1" })) };

    const service = createNotificationService(repo, emailPort as any);

    await service.write({
      db: {} as any,
      userId: "user1",
      category: "booking",
      title: "No User",
      body: "No user row",
      severity: "action",
      emailRequired: true,
    });

    expect(emailPort.send).toHaveBeenCalledTimes(0);
  });

  test("writeInternal logs debug for unsupported category (achievement) with emailPort and recipient email", async () => {
    const repo = makeRepo({
      findNotificationByEventKey: mock(async () => null),
      insertNotification: mock(async () => ({ id: "n_achievement" })),
      findUserEmail: mock(async () => "user@example.com"),
    });
    const emailPort = { send: mock(async () => ({ messageId: "m1" })) };

    const service = createNotificationService(repo, emailPort as any);

    await service.write({
      db: {} as any,
      userId: "user1",
      category: "achievement",
      title: "Achievement Unlocked",
      body: "You earned a badge!",
      severity: "action",
      emailRequired: true,
    });

    expect(emailPort.send).toHaveBeenCalledTimes(0);

    const debugCalls = logCaptures.filter(
      (c: any) => c.action === "notification_email_skipped_category",
    );
    expect(debugCalls.length).toBeGreaterThanOrEqual(1);
  });

  test("writeInternal logs debug for unsupported category (system) with emailPort and recipient email", async () => {
    const repo = makeRepo({
      findNotificationByEventKey: mock(async () => null),
      insertNotification: mock(async () => ({ id: "n_system" })),
      findUserEmail: mock(async () => "user@example.com"),
    });
    const emailPort = { send: mock(async () => ({ messageId: "m1" })) };

    const service = createNotificationService(repo, emailPort as any);

    await service.write({
      db: {} as any,
      userId: "user1",
      category: "system",
      title: "System Notice",
      body: "System notice body",
      severity: "action",
      emailRequired: true,
    });

    expect(emailPort.send).toHaveBeenCalledTimes(0);

    const debugCalls = logCaptures.filter(
      (c: any) => c.action === "notification_email_skipped_category",
    );
    expect(debugCalls.length).toBeGreaterThanOrEqual(1);
  });

  test("writeInternal dispatches email with eventKey dedup check passing (no existing)", async () => {
    const repo = makeRepo({
      findNotificationByEventKey: mock(async () => null),
      insertNotification: mock(async () => ({ id: "n_dedup_pass" })),
      findUserEmail: mock(async () => "user@example.com"),
    });
    const emailPort = { send: mock(async () => ({ messageId: "m1" })) };

    const service = createNotificationService(repo, emailPort as any);

    await service.write({
      db: {} as any,
      userId: "user1",
      category: "booking",
      title: "New Booking",
      body: "New booking body",
      severity: "action",
      eventKey: "booking.b1.new",
      emailRequired: true,
    });

    expect(emailPort.send).toHaveBeenCalledTimes(1);
    expect(repo.updateDispatchStatus).toHaveBeenCalledTimes(1);
  });

  test("writeBestEffort catches and logs errors", async () => {
    const repo = makeRepo({
      findNotificationByEventKey: mock(async () => {
        throw new Error("db error");
      }),
    });
    const emailPort = { send: mock(async () => ({ messageId: "m1" })) };

    const service = createNotificationService(repo, emailPort as any);

    await service.writeBestEffort({
      db: {} as any,
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

  test("write propagates errors", async () => {
    const repo = makeRepo({
      findNotificationByEventKey: mock(async () => {
        throw new Error("db error");
      }),
    });
    const emailPort = { send: mock(async () => ({ messageId: "m1" })) };

    const service = createNotificationService(repo, emailPort as any);

    await expect(
      service.write({
        db: {} as any,
        userId: "user1",
        category: "system",
        title: "Test",
        body: "Test body",
        eventKey: "test.error",
      }),
    ).rejects.toThrow("db error");
  });

  test("service exposes expected methods", async () => {
    const repo = makeRepo();
    const service = createNotificationService(repo);

    expect(typeof service.write).toBe("function");
    expect(typeof service.writeBestEffort).toBe("function");
    expect(typeof service.list).toBe("function");
    expect(typeof service.getUnreadCount).toBe("function");
    expect(typeof service.markAsRead).toBe("function");
    expect(typeof service.markAllAsRead).toBe("function");
  });

  test("writeInternal does not dispatch email for info severity", async () => {
    const repo = makeRepo({
      findNotificationByEventKey: mock(async () => null),
      insertNotification: mock(async () => ({ id: "n_info" })),
    });
    const emailPort = { send: mock(async () => ({ messageId: "m1" })) };

    const service = createNotificationService(repo, emailPort as any);

    await service.write({
      db: {} as any,
      userId: "user1",
      category: "booking",
      title: "Info Notification",
      body: "Just info",
      severity: "info",
      emailRequired: true,
    });

    expect(emailPort.send).toHaveBeenCalledTimes(0);
  });

  test("writeInternal without emailPort does not attempt email dispatch even for action severity", async () => {
    const repo = makeRepo({
      findNotificationByEventKey: mock(async () => null),
      insertNotification: mock(async () => ({ id: "n_no_port" })),
    });

    const service = createNotificationService(repo, undefined as any);

    await service.write({
      db: {} as any,
      userId: "user1",
      category: "booking",
      title: "No email port",
      body: "No email port body",
      severity: "action",
      emailRequired: true,
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

    const repo = makeRepo({
      listNotifications: mock(async () => items),
    });

    const service = createNotificationService(repo);
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

    const repo = makeRepo({
      listNotifications: mock(async () => items),
    });

    const service = createNotificationService(repo);
    const result = await service.list("user1", { limit: 5 });

    expect(result.items.length).toBe(3);
    expect(result.nextCursor).toBeNull();
  });

  test("list passes unreadOnly flag to repo", async () => {
    const repo = makeRepo({
      listNotifications: mock(async () => [
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
      ]),
    });

    const service = createNotificationService(repo);
    await service.list("user1", { unreadOnly: true });

    expect(repo.listNotifications).toHaveBeenCalledWith("user1", {
      unreadOnly: true,
      cursor: undefined,
      limit: 20,
    });
  });

  test("list uses default limit when not specified", async () => {
    const repo = makeRepo({
      listNotifications: mock(async () => []),
    });

    const service = createNotificationService(repo);
    const result = await service.list("user1");

    expect(result.items).toBeDefined();
    expect(repo.listNotifications).toHaveBeenCalledWith("user1", {
      limit: 20,
      cursor: undefined,
      unreadOnly: undefined,
    });
  });

  test("getUnreadCount delegates to repo", async () => {
    const repo = makeRepo({
      countUnread: mock(async () => 5),
    });

    const service = createNotificationService(repo);
    const count = await service.getUnreadCount("user1");

    expect(count).toBe(5);
    expect(repo.countUnread).toHaveBeenCalledWith("user1");
  });

  test("getUnreadCount returns 0 when repo returns 0", async () => {
    const repo = makeRepo({
      countUnread: mock(async () => 0),
    });

    const service = createNotificationService(repo);
    const count = await service.getUnreadCount("user1");

    expect(count).toBe(0);
  });

  test("markAsRead delegates to repo", async () => {
    const repo = makeRepo();

    const service = createNotificationService(repo);
    await service.markAsRead("user1", "n1");

    expect(repo.updateReadStatus).toHaveBeenCalledWith("n1", "user1", true);
  });

  test("markAsRead throws NotificationNotFoundError when notification does not exist for user", async () => {
    const repo = makeRepo({
      findNotificationByIdForUser: mock(async () => null),
    });

    const service = createNotificationService(repo);

    try {
      await service.markAsRead("user1", "nonexistent");
      expect.unreachable("Should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(NotificationNotFoundError);
      expect((err as NotificationNotFoundError).code).toBe(
        "NOTIFICATION_NOT_FOUND",
      );
    }

    expect(repo.updateReadStatus).not.toHaveBeenCalled();
  });

  test("markAllAsRead delegates to repo", async () => {
    const repo = makeRepo();

    const service = createNotificationService(repo);
    await service.markAllAsRead("user1");

    expect(repo.markAllRead).toHaveBeenCalledWith("user1");
  });

  test("writeInternal dispatches email for refund category with action severity", async () => {
    const repo = makeRepo({
      findNotificationByEventKey: mock(async () => null),
      insertNotification: mock(async () => ({ id: "n_refund" })),
      findUserEmail: mock(async () => "refund@example.com"),
    });
    const emailPort = { send: mock(async () => ({ messageId: "m1" })) };

    const service = createNotificationService(repo, emailPort as any);

    await service.write({
      db: {} as any,
      userId: "user1",
      category: "refund",
      title: "Refund Processed",
      body: "Your refund has been processed",
      severity: "action",
      emailRequired: true,
    });

    expect(emailPort.send).toHaveBeenCalledTimes(1);
  });

  test("writeInternal dispatches email for schedule category with critical severity", async () => {
    const repo = makeRepo({
      findNotificationByEventKey: mock(async () => null),
      insertNotification: mock(async () => ({ id: "n_schedule" })),
      findUserEmail: mock(async () => "schedule@example.com"),
    });
    const emailPort = { send: mock(async () => ({ messageId: "m1" })) };

    const service = createNotificationService(repo, emailPort as any);

    await service.write({
      db: {} as any,
      userId: "user1",
      category: "schedule",
      title: "Schedule Changed",
      body: "Your schedule has been updated",
      severity: "critical",
      emailRequired: true,
    });

    expect(emailPort.send).toHaveBeenCalledTimes(1);
  });

  test("writeInternal dispatches email for override category with action severity", async () => {
    const repo = makeRepo({
      findNotificationByEventKey: mock(async () => null),
      insertNotification: mock(async () => ({ id: "n_override" })),
      findUserEmail: mock(async () => "override@example.com"),
    });
    const emailPort = { send: mock(async () => ({ messageId: "m1" })) };

    const service = createNotificationService(repo, emailPort as any);

    await service.write({
      db: {} as any,
      userId: "user1",
      category: "override",
      title: "Override Applied",
      body: "An override was applied",
      severity: "action",
      emailRequired: true,
    });

    expect(emailPort.send).toHaveBeenCalledTimes(1);
  });

  test("writeInternal dispatches email for payment category with action severity", async () => {
    const repo = makeRepo({
      findNotificationByEventKey: mock(async () => null),
      insertNotification: mock(async () => ({ id: "n_payment" })),
      findUserEmail: mock(async () => "payment@example.com"),
    });
    const emailPort = { send: mock(async () => ({ messageId: "m1" })) };

    const service = createNotificationService(repo, emailPort as any);

    await service.write({
      db: {} as any,
      userId: "user1",
      category: "payment",
      title: "Payment Received",
      body: "Your payment was received",
      severity: "action",
      emailRequired: true,
    });

    expect(emailPort.send).toHaveBeenCalledTimes(1);
  });

  test("skips email dispatch for unsupported categories (achievement) with emailPort", async () => {
    const repo = makeRepo({
      findNotificationByEventKey: mock(async () => null),
      insertNotification: mock(async () => ({ id: "n_achievement" })),
      findUserEmail: mock(async () => "user@example.com"),
    });
    const emailPort = { send: mock(async () => ({ messageId: "m1" })) };

    const service = createNotificationService(repo, emailPort as any);

    await service.write({
      db: {} as any,
      userId: "user1",
      category: "achievement",
      title: "Achievement Unlocked",
      body: "You earned a badge!",
      severity: "action",
      emailRequired: true,
    });

    expect(emailPort.send).toHaveBeenCalledTimes(0);

    const debugCalls = logCaptures.filter(
      (c: any) => c.action === "notification_email_skipped_category",
    );
    expect(debugCalls.length).toBeGreaterThanOrEqual(1);
  });

  test("dispatches email for supported categories (booking)", async () => {
    const repo = makeRepo({
      findNotificationByEventKey: mock(async () => null),
      insertNotification: mock(async () => ({ id: "n_booking" })),
      findUserEmail: mock(async () => "user@example.com"),
    });
    const emailPort = { send: mock(async () => ({ messageId: "m1" })) };

    const service = createNotificationService(repo, emailPort as any);

    await service.write({
      db: {} as any,
      userId: "user1",
      category: "booking",
      title: "Booking Confirmed",
      body: "Your booking is confirmed",
      severity: "action",
      emailRequired: true,
    });

    expect(emailPort.send).toHaveBeenCalledTimes(1);
  });

  test("getUnreadCount is exposed as a function", async () => {
    const repo = makeRepo();
    const service = createNotificationService(repo);
    expect(typeof service.getUnreadCount).toBe("function");
  });
});

describe("write vs writeBestEffort", () => {
  const makeTestRepo = (overrides: Record<string, unknown> = {}) => ({
    findNotificationByEventKey: mock(async () => null),
    insertNotification: mock(async () => ({ id: "n1" })),
    findUserEmail: mock(async () => null),
    insertDispatch: mock(async () => {}),
    updateDispatchStatus: mock(async () => {}),
    listNotifications: mock(async () => []),
    countUnread: mock(async () => 0),
    findNotificationByIdForUser: mock(async () => null),
    updateReadStatus: mock(async () => {}),
    markAllRead: mock(async () => {}),
    findDispatch: mock(async () => null),
    ...overrides,
  });

  const baseParams = {
    db: {} as any,
    userId: "u1",
    bookingId: "b1",
    category: "booking" as const,
    title: "Test",
    body: "Test body",
    severity: "info" as const,
    eventKey: "test.key",
  };

  test("write propagates errors from writeInternal", async () => {
    const repo = makeTestRepo({
      insertNotification: mock(async () => {
        throw new Error("DB insert failed");
      }),
    });

    const service = createNotificationService(repo);
    await expect(service.write(baseParams)).rejects.toThrow("DB insert failed");
  });

  test("write succeeds when writeInternal succeeds", async () => {
    const repo = makeTestRepo();
    const service = createNotificationService(repo);
    await expect(service.write(baseParams)).resolves.toBeUndefined();
  });

  test("writeBestEffort swallows errors from writeInternal", async () => {
    const repo = makeTestRepo({
      insertNotification: mock(async () => {
        throw new Error("DB insert failed");
      }),
    });

    const logCaptures: any[] = [];
    const origError = console.error;
    console.error = (...args: unknown[]) => {
      try {
        logCaptures.push(JSON.parse(args[0] as string));
      } catch {
        logCaptures.push(args);
      }
    };

    const service = createNotificationService(repo);
    await expect(service.writeBestEffort(baseParams)).resolves.toBeUndefined();

    console.error = origError;

    const errorLog = logCaptures.find(
      (e: any) => e.action === "notification_write_failed",
    );
    expect(errorLog).toBeDefined();
    expect(errorLog.error.message).toContain("DB insert failed");
  });

  test("writeBestEffort succeeds when writeInternal succeeds", async () => {
    const repo = makeTestRepo();
    const service = createNotificationService(repo);
    await expect(service.writeBestEffort(baseParams)).resolves.toBeUndefined();
  });
});

describe("NotificationService email routing decision (G17)", () => {
  function makeRepo(overrides: Partial<NotificationRepo> = {}): NotificationRepo {
    return {
      findNotificationByEventKey: mock(async () => null),
      findNotificationByIdForUser: mock(async () => ({ id: "n1" })),
      insertNotification: mock(async () => ({ id: "n_email" })),
      findUserEmail: mock(async () => "user@example.com"),
      insertDispatch: mock(async () => {}),
      updateDispatchStatus: mock(async () => {}),
      listNotifications: mock(async () => []),
      countUnread: mock(async () => 0),
      updateReadStatus: mock(async () => {}),
      markAllRead: mock(async () => {}),
      findDispatch: mock(async () => null),
      ...overrides,
    } as any;
  }

  const baseParams = {
    db: {} as any,
    userId: "user1",
    category: "booking" as const,
    title: "Test",
    body: "Test body",
    severity: "action" as const,
    eventKey: "test.key",
  };

  test("emailRequired true + action severity + supported category → email dispatched and status sent", async () => {
    const repo = makeRepo();
    const emailPort = { send: mock(async () => ({ messageId: "m1" })) };
    const service = createNotificationService(repo, emailPort as any);

    await service.write({ ...baseParams, emailRequired: true });

    expect(repo.insertDispatch).toHaveBeenCalledTimes(1);
    expect(repo.insertDispatch).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        notificationId: "n_email",
        channel: "email",
        recipientEmail: "user@example.com",
        status: "queued",
      }),
    );
    expect(emailPort.send).toHaveBeenCalledTimes(1);
    expect(repo.updateDispatchStatus).toHaveBeenCalledWith(
      expect.anything(),
      "n_email",
      "sent",
    );
  });

  test("emailRequired default false + action severity + supported category → no email", async () => {
    const repo = makeRepo();
    const emailPort = { send: mock(async () => ({ messageId: "m1" })) };
    const service = createNotificationService(repo, emailPort as any);

    await service.write({ ...baseParams });

    expect(repo.insertDispatch).toHaveBeenCalledTimes(0);
    expect(emailPort.send).toHaveBeenCalledTimes(0);
  });

  test("emailRequired true + info severity + supported category → no email (severity gate)", async () => {
    const repo = makeRepo();
    const emailPort = { send: mock(async () => ({ messageId: "m1" })) };
    const service = createNotificationService(repo, emailPort as any);

    await service.write({
      ...baseParams,
      severity: "info",
      emailRequired: true,
    });

    expect(repo.insertDispatch).toHaveBeenCalledTimes(0);
    expect(emailPort.send).toHaveBeenCalledTimes(0);
  });

  test("emailRequired true + achievement category → no email (category backstop), in-app row kept", async () => {
    const repo = makeRepo();
    const emailPort = { send: mock(async () => ({ messageId: "m1" })) };
    const service = createNotificationService(repo, emailPort as any);

    await service.write({
      ...baseParams,
      category: "achievement",
      emailRequired: true,
    });

    expect(repo.insertNotification).toHaveBeenCalledTimes(1);
    expect(repo.insertDispatch).toHaveBeenCalledTimes(0);
    expect(emailPort.send).toHaveBeenCalledTimes(0);
  });

  test("achievement in-app only: emailRequired false → notification row, no dispatch", async () => {
    const repo = makeRepo();
    const emailPort = { send: mock(async () => ({ messageId: "m1" })) };
    const service = createNotificationService(repo, emailPort as any);

    await service.write({
      ...baseParams,
      category: "achievement",
      severity: "info",
    });

    expect(repo.insertNotification).toHaveBeenCalledTimes(1);
    expect(repo.insertDispatch).toHaveBeenCalledTimes(0);
    expect(emailPort.send).toHaveBeenCalledTimes(0);
  });
});
