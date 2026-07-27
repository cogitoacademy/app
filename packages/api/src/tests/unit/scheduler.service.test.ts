import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";

let capturedJobHandler: ((job: any) => Promise<any>) | null = null;
let capturedFailedHandler: ((job: any, err: Error) => void) | null = null;
let capturedCompletedHandler: ((job: any) => void) | null = null;

const mockQueueAdd = mock(async () => ({}));

const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
let logCaptures: any[] = [];

beforeEach(() => {
  logCaptures = [];
  console.log = (...args: unknown[]) => {
    try {
      logCaptures.push({ level: "info", entry: JSON.parse(args[0] as string) });
    } catch {
      logCaptures.push({ level: "info", raw: args });
    }
  };
  console.error = (...args: unknown[]) => {
    try {
      logCaptures.push({
        level: "error",
        entry: JSON.parse(args[0] as string),
      });
    } catch {
      logCaptures.push({ level: "error", raw: args });
    }
  };
  console.warn = (...args: unknown[]) => {
    try {
      logCaptures.push({ level: "warn", entry: JSON.parse(args[0] as string) });
    } catch {
      logCaptures.push({ level: "warn", raw: args });
    }
  };
  mockQueueAdd.mockClear();
  capturedJobHandler = null;
  capturedFailedHandler = null;
  capturedCompletedHandler = null;
});

afterEach(() => {
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
});

mock.module("bullmq", () => ({
  Queue: class {
    add = mockQueueAdd;
  },
  Worker: class {
    constructor(
      _queueName: string,
      handler: (job: any) => Promise<any>,
      _opts: any,
    ) {
      capturedJobHandler = handler;
    }
    on(event: string, handler: any) {
      if (event === "failed") capturedFailedHandler = handler;
      if (event === "completed") capturedCompletedHandler = handler;
    }
  },
}));

import { createSchedulerService } from "../../modules/scheduler/scheduler.service";

describe("createSchedulerService", () => {
  test("returns null when redisUrl is empty", () => {
    const result = createSchedulerService("", {
      onExpireBookings: mock(async () => ({ expired: 0, failed: 0 })),
      onReleaseHolds: mock(async () => ({ released: 0 })),
      onSendNotificationEmail: mock(async () => {}),
    });
    expect(result).toBeNull();
  });

  test("returns queue and worker when redisUrl is provided", () => {
    const result = createSchedulerService("redis://localhost:6379", {
      onExpireBookings: mock(async () => ({ expired: 0, failed: 0 })),
      onReleaseHolds: mock(async () => ({ released: 0 })),
      onSendNotificationEmail: mock(async () => {}),
    });
    expect(result).not.toBeNull();
    expect(result).toHaveProperty("queue");
    expect(result).toHaveProperty("worker");
  });

  test("handles expire-bookings job", async () => {
    const onExpireBookings = mock(async () => ({ expired: 5, failed: 0 }));
    createSchedulerService("redis://localhost:6379", {
      onExpireBookings,
      onReleaseHolds: mock(async () => ({ released: 0 })),
      onSendNotificationEmail: mock(async () => {}),
    });

    expect(capturedJobHandler).not.toBeNull();

    const job = { id: "1", name: "expire-bookings", data: {} };
    const result = await capturedJobHandler!(job);

    expect(onExpireBookings).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ expired: 5, failed: 0 });
  });

  test("logs warn level when expire-bookings has failures", async () => {
    const onExpireBookings = mock(async () => ({ expired: 3, failed: 2 }));
    createSchedulerService("redis://localhost:6379", {
      onExpireBookings,
      onReleaseHolds: mock(async () => ({ released: 0 })),
      onSendNotificationEmail: mock(async () => {}),
    });

    expect(capturedJobHandler).not.toBeNull();

    const job = { id: "1", name: "expire-bookings", data: {} };
    await capturedJobHandler!(job);

    const warnLogs = logCaptures.filter(
      (l) =>
        l.level === "warn" && l.entry?.action === "expire_bookings_complete",
    );
    expect(warnLogs.length).toBe(1);
    expect(warnLogs[0].entry).toMatchObject({ expired: 3, failed: 2 });
  });

  test("handles release-expired-holds job", async () => {
    const onReleaseHolds = mock(async () => ({ released: 3 }));
    createSchedulerService("redis://localhost:6379", {
      onExpireBookings: mock(async () => ({ expired: 0, failed: 0 })),
      onReleaseHolds,
      onSendNotificationEmail: mock(async () => {}),
    });

    expect(capturedJobHandler).not.toBeNull();

    const job = { id: "2", name: "release-expired-holds", data: {} };
    const result = await capturedJobHandler!(job);

    expect(onReleaseHolds).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ released: 3 });
  });

  test("handles send-notification-email job", async () => {
    const onSendNotificationEmail = mock(async () => {});
    createSchedulerService("redis://localhost:6379", {
      onExpireBookings: mock(async () => ({ expired: 0, failed: 0 })),
      onReleaseHolds: mock(async () => ({ released: 0 })),
      onSendNotificationEmail,
    });

    expect(capturedJobHandler).not.toBeNull();

    const job = {
      id: "3",
      name: "send-notification-email",
      data: { notificationId: "n1", userId: "u1" },
    };
    await capturedJobHandler!(job);

    expect(onSendNotificationEmail).toHaveBeenCalledWith({
      notificationId: "n1",
      userId: "u1",
    });
  });

  test("logs warning for unknown job", async () => {
    createSchedulerService("redis://localhost:6379", {
      onExpireBookings: mock(async () => ({ expired: 0, failed: 0 })),
      onReleaseHolds: mock(async () => ({ released: 0 })),
      onSendNotificationEmail: mock(async () => {}),
    });

    expect(capturedJobHandler).not.toBeNull();

    logCaptures = [];
    const job = { id: "4", name: "unknown-job", data: {} };
    await capturedJobHandler!(job);

    const warnCalls = logCaptures.filter(
      (c) => c.entry?.action === "scheduler_unknown_job",
    );
    expect(warnCalls.length).toBeGreaterThanOrEqual(1);
  });

  test("worker failed handler logs error", () => {
    createSchedulerService("redis://localhost:6379", {
      onExpireBookings: mock(async () => ({ expired: 0, failed: 0 })),
      onReleaseHolds: mock(async () => ({ released: 0 })),
      onSendNotificationEmail: mock(async () => {}),
    });

    expect(capturedFailedHandler).not.toBeNull();

    logCaptures = [];
    const error = new Error("test error");
    capturedFailedHandler!({ name: "test-job" }, error);

    const errorCalls = logCaptures.filter(
      (c) => c.entry?.action === "scheduler_job_failed",
    );
    expect(errorCalls.length).toBeGreaterThanOrEqual(1);
  });

  test("worker completed handler logs info", () => {
    createSchedulerService("redis://localhost:6379", {
      onExpireBookings: mock(async () => ({ expired: 0, failed: 0 })),
      onReleaseHolds: mock(async () => ({ released: 0 })),
      onSendNotificationEmail: mock(async () => {}),
    });

    expect(capturedCompletedHandler).not.toBeNull();

    logCaptures = [];
    capturedCompletedHandler!({ name: "test-job" });

    const completedCalls = logCaptures.filter(
      (c) => c.entry?.action === "scheduler_job_completed",
    );
    expect(completedCalls.length).toBeGreaterThanOrEqual(1);
  });
});
