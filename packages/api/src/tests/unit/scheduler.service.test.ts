import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";

let capturedJobHandler: ((job: any) => Promise<any>) | null = null;
let capturedFailedHandler: ((job: any, err: Error) => void) | null = null;
let capturedCompletedHandler: ((job: any) => void) | null = null;
let capturedDlqJobHandler: ((job: any) => Promise<any>) | null = null;
let capturedQueueOptions: any = null;
let capturedDlqQueueOptions: any = null;

const mockQueueAdd = mock(async () => ({}));
const mockDlqQueueAdd = mock(async () => ({}));
const mockRunCommand = mock(async () => "OK");

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
  mockDlqQueueAdd.mockClear();
  mockRunCommand.mockClear();
  capturedJobHandler = null;
  capturedFailedHandler = null;
  capturedCompletedHandler = null;
  capturedDlqJobHandler = null;
  capturedQueueOptions = null;
  capturedDlqQueueOptions = null;
});

afterEach(() => {
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
});

mock.module("bullmq", () => ({
  Queue: class {
    add: any;
    backend: any;
    constructor(queueName: string, opts: any) {
      if (queueName === "cogito-jobs-dlq") {
        capturedDlqQueueOptions = opts;
      } else {
        capturedQueueOptions = opts;
      }
      this.add =
        queueName === "cogito-jobs-dlq" ? mockDlqQueueAdd : mockQueueAdd;
      this.backend = {
        get client() {
          return Promise.resolve({
            defineCommand: mock(async () => {}),
            runCommand: mockRunCommand,
          });
        },
      };
    }
  },
  Worker: class {
    constructor(
      queueName: string,
      handler: (job: any) => Promise<any>,
      _opts: any,
    ) {
      if (queueName === "cogito-jobs-dlq") {
        capturedDlqJobHandler = handler;
      } else {
        capturedJobHandler = handler;
      }
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
      onCheckTutorLateness: mock(async () => ({ flagged: 0, failed: 0 })),
      onSendNotificationEmail: mock(async () => ({ sent: 0, failed: 0 })),
      onEscalateSupportTickets: mock(async () => ({ escalated: 0 })),
    });
    expect(result).toBeNull();
  });

  test("returns queue and worker when redisUrl is provided", () => {
    const result = createSchedulerService("redis://localhost:6379", {
      onExpireBookings: mock(async () => ({ expired: 0, failed: 0 })),
      onReleaseHolds: mock(async () => ({ released: 0 })),
      onCheckTutorLateness: mock(async () => ({ flagged: 0, failed: 0 })),
      onSendNotificationEmail: mock(async () => ({ sent: 0, failed: 0 })),
      onEscalateSupportTickets: mock(async () => ({ escalated: 0 })),
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
      onSendNotificationEmail: mock(async () => ({ sent: 0, failed: 0 })),
      onEscalateSupportTickets: mock(async () => ({ escalated: 0 })),
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
      onSendNotificationEmail: mock(async () => ({ sent: 0, failed: 0 })),
      onEscalateSupportTickets: mock(async () => ({ escalated: 0 })),
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
      onCheckTutorLateness: mock(async () => ({ flagged: 0, failed: 0 })),
      onSendNotificationEmail: mock(async () => ({ sent: 0, failed: 0 })),
      onEscalateSupportTickets: mock(async () => ({ escalated: 0 })),
    });

    expect(capturedJobHandler).not.toBeNull();

    const job = { id: "2", name: "release-expired-holds", data: {} };
    const result = await capturedJobHandler!(job);

    expect(onReleaseHolds).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ released: 3 });
  });

  test("handles retry-failed-meetings job", async () => {
    const onRetryFailedMeetings = mock(async () => ({
      succeeded: 2,
      failed: 1,
    }));
    createSchedulerService("redis://localhost:6379", {
      onExpireBookings: mock(async () => ({ expired: 0, failed: 0 })),
      onReleaseHolds: mock(async () => ({ released: 0 })),
      onCheckTutorLateness: mock(async () => ({ flagged: 0, failed: 0 })),
      onSendNotificationEmail: mock(async () => ({ sent: 0, failed: 0 })),
      onEscalateSupportTickets: mock(async () => ({ escalated: 0 })),
      onRetryFailedMeetings,
    });

    const result = await capturedJobHandler!({
      id: "retry-1",
      name: "retry-failed-meetings",
      data: {},
    });

    expect(onRetryFailedMeetings).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ succeeded: 2, failed: 1 });
  });

  test("handles check-tutor-lateness job", async () => {
    const onCheckTutorLateness = mock(async () => ({
      flagged: 2,
      failed: 0,
    }));
    createSchedulerService("redis://localhost:6379", {
      onExpireBookings: mock(async () => ({ expired: 0, failed: 0 })),
      onReleaseHolds: mock(async () => ({ released: 0 })),
      onCheckTutorLateness,
      onSendNotificationEmail: mock(async () => ({ sent: 0, failed: 0 })),
      onEscalateSupportTickets: mock(async () => ({ escalated: 0 })),
    });

    expect(capturedJobHandler).not.toBeNull();

    const job = { id: "2b", name: "check-tutor-lateness", data: {} };
    const result = await capturedJobHandler!(job);

    expect(onCheckTutorLateness).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ flagged: 2, failed: 0 });
  });

  test("logs warn level when check-tutor-lateness has failures", async () => {
    const onCheckTutorLateness = mock(async () => ({
      flagged: 1,
      failed: 1,
    }));
    createSchedulerService("redis://localhost:6379", {
      onExpireBookings: mock(async () => ({ expired: 0, failed: 0 })),
      onReleaseHolds: mock(async () => ({ released: 0 })),
      onCheckTutorLateness,
      onSendNotificationEmail: mock(async () => ({ sent: 0, failed: 0 })),
      onEscalateSupportTickets: mock(async () => ({ escalated: 0 })),
    });

    expect(capturedJobHandler).not.toBeNull();

    const job = { id: "2c", name: "check-tutor-lateness", data: {} };
    await capturedJobHandler!(job);

    const warnLogs = logCaptures.filter(
      (l) =>
        l.level === "warn" &&
        l.entry?.action === "check_tutor_lateness_complete",
    );
    expect(warnLogs.length).toBe(1);
    expect(warnLogs[0].entry).toMatchObject({ flagged: 1, failed: 1 });
  });

  test("handles send-notification-email job", async () => {
    const onSendNotificationEmail = mock(async () => ({
      sent: 3,
      failed: 1,
    }));
    createSchedulerService("redis://localhost:6379", {
      onExpireBookings: mock(async () => ({ expired: 0, failed: 0 })),
      onReleaseHolds: mock(async () => ({ released: 0 })),
      onSendNotificationEmail,
      onEscalateSupportTickets: mock(async () => ({ escalated: 0 })),
    });

    expect(capturedJobHandler).not.toBeNull();

    const job = {
      id: "3",
      name: "send-notification-email",
      data: {},
    };
    const result = await capturedJobHandler!(job);

    expect(onSendNotificationEmail).toHaveBeenCalledTimes(1);
    expect(onSendNotificationEmail).toHaveBeenCalledWith();
    expect(result).toEqual({ sent: 3, failed: 1 });
  });

  test("handles escalate-support-tickets job", async () => {
    const onEscalateSupportTickets = mock(async () => ({ escalated: 2 }));
    createSchedulerService("redis://localhost:6379", {
      onExpireBookings: mock(async () => ({ expired: 0, failed: 0 })),
      onReleaseHolds: mock(async () => ({ released: 0 })),
      onSendNotificationEmail: mock(async () => ({ sent: 0, failed: 0 })),
      onEscalateSupportTickets,
    });

    expect(capturedJobHandler).not.toBeNull();

    const job = {
      id: "5",
      name: "escalate-support-tickets",
      data: {},
    };
    const result = await capturedJobHandler!(job);

    expect(onEscalateSupportTickets).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ escalated: 2 });

    const infoLogs = logCaptures.filter(
      (l) => l.entry?.action === "escalate_support_tickets_complete",
    );
    expect(infoLogs.length).toBe(1);
  });

  test("logs warning for unknown job", async () => {
    createSchedulerService("redis://localhost:6379", {
      onExpireBookings: mock(async () => ({ expired: 0, failed: 0 })),
      onReleaseHolds: mock(async () => ({ released: 0 })),
      onCheckTutorLateness: mock(async () => ({ flagged: 0, failed: 0 })),
      onSendNotificationEmail: mock(async () => ({ sent: 0, failed: 0 })),
      onEscalateSupportTickets: mock(async () => ({ escalated: 0 })),
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
      onCheckTutorLateness: mock(async () => ({ flagged: 0, failed: 0 })),
      onSendNotificationEmail: mock(async () => ({ sent: 0, failed: 0 })),
      onEscalateSupportTickets: mock(async () => ({ escalated: 0 })),
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
      onCheckTutorLateness: mock(async () => ({ flagged: 0, failed: 0 })),
      onSendNotificationEmail: mock(async () => ({ sent: 0, failed: 0 })),
      onEscalateSupportTickets: mock(async () => ({ escalated: 0 })),
    });

    expect(capturedCompletedHandler).not.toBeNull();

    logCaptures = [];
    capturedCompletedHandler!({ name: "test-job" });

    const completedCalls = logCaptures.filter(
      (c) => c.entry?.action === "scheduler_job_completed",
    );
    expect(completedCalls.length).toBeGreaterThanOrEqual(1);
  });

  test("M4: failed job is pushed to the DLQ queue", () => {
    createSchedulerService("redis://localhost:6379", {
      onExpireBookings: mock(async () => ({ expired: 0, failed: 0 })),
      onReleaseHolds: mock(async () => ({ released: 0 })),
      onCheckTutorLateness: mock(async () => ({ flagged: 0, failed: 0 })),
      onSendNotificationEmail: mock(async () => ({ sent: 0, failed: 0 })),
      onEscalateSupportTickets: mock(async () => ({ escalated: 0 })),
    });

    expect(capturedFailedHandler).not.toBeNull();

    const error = new Error("boom");
    capturedFailedHandler!(
      {
        id: "job-1",
        name: "expire-bookings",
        attemptsMade: 3,
        opts: { attempts: 3 },
        data: { x: 1 },
      },
      error,
    );

    expect(mockDlqQueueAdd).toHaveBeenCalledTimes(1);
    const [jobName, payload] = mockDlqQueueAdd.mock.calls[0];
    expect(jobName).toBe("expire-bookings");
    expect(payload).toMatchObject({
      originalJobId: "job-1",
      attemptsMade: 3,
      failedReason: "boom",
      data: { x: 1 },
    });
  });

  test("M4: retryable failure is not copied to the DLQ", () => {
    createSchedulerService("redis://localhost:6379", {
      onExpireBookings: mock(async () => ({ expired: 0, failed: 0 })),
      onReleaseHolds: mock(async () => ({ released: 0 })),
      onCheckTutorLateness: mock(async () => ({ flagged: 0, failed: 0 })),
      onSendNotificationEmail: mock(async () => ({ sent: 0, failed: 0 })),
      onEscalateSupportTickets: mock(async () => ({ escalated: 0 })),
    });

    capturedFailedHandler!(
      {
        id: "job-retrying",
        name: "expire-bookings",
        attemptsMade: 1,
        opts: { attempts: 3 },
        data: {},
      },
      new Error("transient failure"),
    );

    expect(mockDlqQueueAdd).not.toHaveBeenCalled();
  });

  test("M4: DLQ worker logs the job and keeps a bounded Redis list", async () => {
    createSchedulerService("redis://localhost:6379", {
      onExpireBookings: mock(async () => ({ expired: 0, failed: 0 })),
      onReleaseHolds: mock(async () => ({ released: 0 })),
      onCheckTutorLateness: mock(async () => ({ flagged: 0, failed: 0 })),
      onSendNotificationEmail: mock(async () => ({ sent: 0, failed: 0 })),
      onEscalateSupportTickets: mock(async () => ({ escalated: 0 })),
    });

    expect(capturedDlqJobHandler).not.toBeNull();

    logCaptures = [];
    await capturedDlqJobHandler!({
      id: "dlq-1",
      name: "expire-bookings",
      data: { originalJobId: "job-1", failedReason: "boom" },
    });

    const dlqCalls = logCaptures.filter(
      (c) => c.entry?.action === "scheduler_dlq_job",
    );
    expect(dlqCalls.length).toBeGreaterThanOrEqual(1);
    expect(mockRunCommand).toHaveBeenCalledTimes(1);
    const [commandName, args] = mockRunCommand.mock.calls[0];
    expect(commandName).toBe("cogitoDlqPush");
    expect(args[0]).toBe("cogito:dlq");
    expect(args[2]).toBe("100");
    // Age-aware health: entries are stamped at push time (epoch ms) so
    // checkDlqHealth can count only fresh failures. The failed-job payload
    // never carries failedAt itself, so the worker must add it.
    const entry = JSON.parse(args[1] as string);
    expect(typeof entry.failedAt).toBe("number");
    expect(Number(entry.failedAt)).toBeLessThanOrEqual(Date.now());
    expect(entry).toMatchObject({
      originalJobId: "job-1",
      failedReason: "boom",
    });
  });

  test("M4: DLQ entry keeps existing failedAt from the payload (override-guard)", async () => {
    createSchedulerService("redis://localhost:6379", {
      onExpireBookings: mock(async () => ({ expired: 0, failed: 0 })),
      onReleaseHolds: mock(async () => ({ released: 0 })),
      onCheckTutorLateness: mock(async () => ({ flagged: 0, failed: 0 })),
      onSendNotificationEmail: mock(async () => ({ sent: 0, failed: 0 })),
      onEscalateSupportTickets: mock(async () => ({ escalated: 0 })),
    });

    expect(capturedDlqJobHandler).not.toBeNull();

    logCaptures = [];
    const staleTs = 1_700_000_000_000;
    await capturedDlqJobHandler!({
      id: "dlq-2",
      name: "expire-bookings",
      data: {
        originalJobId: "job-2",
        failedReason: "boom",
        failedAt: staleTs,
      },
    });

    const [, args] = mockRunCommand.mock.calls.at(-1)!;
    expect(JSON.parse(args[1] as string).failedAt).toBe(Number(staleTs));
  });

  test("logs when the DLQ Redis list cannot be updated", async () => {
    mockRunCommand.mockRejectedValueOnce(new Error("redis unavailable"));
    createSchedulerService("redis://localhost:6379", {
      onExpireBookings: mock(async () => ({ expired: 0, failed: 0 })),
      onReleaseHolds: mock(async () => ({ released: 0 })),
      onCheckTutorLateness: mock(async () => ({ flagged: 0, failed: 0 })),
      onSendNotificationEmail: mock(async () => ({ sent: 0, failed: 0 })),
      onEscalateSupportTickets: mock(async () => ({ escalated: 0 })),
    });

    await capturedDlqJobHandler!({
      id: "dlq-error",
      name: "expire-bookings",
      data: { failedReason: "boom" },
    });

    expect(
      logCaptures.some(
        (entry) => entry.entry?.action === "scheduler_dlq_list_failed",
      ),
    ).toBe(true);
  });

  test("logs when adding a failed job to the DLQ fails", async () => {
    mockDlqQueueAdd.mockRejectedValueOnce(new Error("dlq unavailable"));
    createSchedulerService("redis://localhost:6379", {
      onExpireBookings: mock(async () => ({ expired: 0, failed: 0 })),
      onReleaseHolds: mock(async () => ({ released: 0 })),
      onCheckTutorLateness: mock(async () => ({ flagged: 0, failed: 0 })),
      onSendNotificationEmail: mock(async () => ({ sent: 0, failed: 0 })),
      onEscalateSupportTickets: mock(async () => ({ escalated: 0 })),
    });

    capturedFailedHandler!(
      {
        id: "job-error",
        name: "expire-bookings",
        attemptsMade: 3,
        opts: { attempts: 3 },
        data: {},
      },
      new Error("job failed"),
    );
    await Promise.resolve();

    expect(
      logCaptures.some(
        (entry) => entry.entry?.action === "scheduler_dlq_add_failed",
      ),
    ).toBe(true);
  });

  test("N2: queue-level defaultJobOptions bounds completed/failed retention", () => {
    createSchedulerService("redis://localhost:6379", {
      onExpireBookings: mock(async () => ({ expired: 0, failed: 0 })),
      onReleaseHolds: mock(async () => ({ released: 0 })),
      onCheckTutorLateness: mock(async () => ({ flagged: 0, failed: 0 })),
      onSendNotificationEmail: mock(async () => ({ sent: 0, failed: 0 })),
      onEscalateSupportTickets: mock(async () => ({ escalated: 0 })),
    });

    expect(capturedQueueOptions).not.toBeNull();
    expect(capturedQueueOptions.defaultJobOptions).toEqual({
      removeOnComplete: { age: 24 * 3600, count: 100 },
      removeOnFail: { age: 7 * 24 * 3600, count: 50 },
    });
    // The DLQ queue must NOT inherit the retention (its records are already
    // bounded by the DLQ Redis list) — only the main cogito-jobs queue bounds
    // its completed/failed sets.
    expect(capturedDlqQueueOptions).not.toBeNull();
    expect(capturedDlqQueueOptions.defaultJobOptions).toBeUndefined();
  });
});
