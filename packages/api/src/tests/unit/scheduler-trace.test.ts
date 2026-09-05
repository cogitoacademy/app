import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import { runWithTrace, getTrace } from "../../lib/trace";
import { scheduleBookingExpiryCheck } from "../../modules/scheduler/jobs/expire-bookings.job";
import { scheduleHoldReleaseCheck } from "../../modules/scheduler/jobs/release-holds.job";
import { scheduleCheckTutorLateness } from "../../modules/scheduler/jobs/check-tutor-lateness.job";
import { scheduleSendNotificationEmail } from "../../modules/scheduler/jobs/send-notification-email.job";
import { scheduleEscalateSupportTickets } from "../../modules/scheduler/jobs/escalate-support-tickets.job";
import { scheduleRetryFailedMeetings } from "../../modules/scheduler/jobs/retry-failed-meetings.job";

const STAMP = { traceId: "req_stamp", userId: "u_stamp" };

function fakeQueue() {
  const upsertJobScheduler = mock(async () => ({}));
  return { queue: { upsertJobScheduler } as any, upsertJobScheduler };
}

describe("scheduler trace stamping (T1)", () => {
  test("all 6 schedule* payloads carry the active trace", async () => {
    await runWithTrace(STAMP, async () => {
      for (const schedule of [
        scheduleBookingExpiryCheck,
        scheduleHoldReleaseCheck,
        scheduleCheckTutorLateness,
        scheduleSendNotificationEmail,
        scheduleEscalateSupportTickets,
        scheduleRetryFailedMeetings,
      ]) {
        const { queue, upsertJobScheduler } = fakeQueue();
        // eslint-disable-next-line no-await-in-loop
        await schedule(queue);
        expect(upsertJobScheduler).toHaveBeenCalledTimes(1);
        expect(upsertJobScheduler.mock.calls[0][2].data).toEqual(STAMP);
      }
    });
  });

  test("schedule payloads stay empty with no active trace", async () => {
    const { queue, upsertJobScheduler } = fakeQueue();
    await scheduleBookingExpiryCheck(queue);
    expect(upsertJobScheduler.mock.calls[0][2].data).toEqual({});
  });
});

let capturedJobHandler: ((job: any) => Promise<any>) | null = null;
let capturedFailedHandler: ((job: any, err: Error) => void) | null = null;
let capturedCompletedHandler: ((job: any) => void) | null = null;

mock.module("bullmq", () => ({
  Queue: class {
    add = mock(async () => ({}));
    backend = {
      get client() {
        return Promise.resolve({
          defineCommand: mock(async () => {}),
          runCommand: mock(async () => "OK"),
        });
      },
    };
  },
  Worker: class {
    constructor(
      queueName: string,
      handler: (job: any) => Promise<any>,
      _opts: any,
    ) {
      if (queueName !== "cogito-jobs-dlq") capturedJobHandler = handler;
    }
    on(event: string, handler: any) {
      if (event === "failed") capturedFailedHandler = handler;
      if (event === "completed") capturedCompletedHandler = handler;
    }
  },
}));

const { createSchedulerService } =
  await import("../../modules/scheduler/scheduler.service");

describe("scheduler worker trace scope (T1)", () => {
  let logCaptures: any[] = [];
  const originalConsoleLog = console.log;
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;

  beforeEach(() => {
    logCaptures = [];
    capturedJobHandler = null;
    capturedFailedHandler = null;
    capturedCompletedHandler = null;
    const capture = (...args: unknown[]) => {
      try {
        logCaptures.push(JSON.parse(args[0] as string));
      } catch {
        logCaptures.push({ raw: args });
      }
    };
    console.log = capture as typeof console.log;
    console.error = capture as typeof console.error;
    console.warn = capture as typeof console.warn;
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
  });

  function makeService(overrides: Record<string, unknown> = {}) {
    return createSchedulerService("redis://localhost:6379", {
      onExpireBookings: mock(async () => ({ expired: 0, failed: 0 })),
      onReleaseHolds: mock(async () => ({ released: 0 })),
      onCheckTutorLateness: mock(async () => ({ flagged: 0, failed: 0 })),
      onSendNotificationEmail: mock(async () => ({ sent: 0, failed: 0 })),
      onEscalateSupportTickets: mock(async () => ({ escalated: 0 })),
      onRetryFailedMeetings: mock(async () => ({ succeeded: 0, failed: 0 })),
      ...overrides,
    } as any);
  }

  test("worker runs handlers inside the stamped trace and logs it", async () => {
    let seen: ReturnType<typeof getTrace>;
    const onExpireBookings = mock(async () => {
      seen = getTrace();
      return { expired: 1, failed: 0 };
    });
    makeService({ onExpireBookings });

    expect(capturedJobHandler).not.toBeNull();
    logCaptures = [];
    await capturedJobHandler!({
      id: "j1",
      name: "expire-bookings",
      data: { traceId: "req_job1", userId: "u_job1" },
    });

    expect(seen!).toEqual({ traceId: "req_job1", userId: "u_job1" });
    const start = logCaptures.find(
      (c: any) => c.action === "scheduler_job_start",
    );
    expect(start?.traceId).toBe("req_job1");
    expect(start?.userId).toBe("u_job1");
    const done = logCaptures.find(
      (c: any) => c.action === "expire_bookings_complete",
    );
    expect(done?.traceId).toBe("req_job1");
  });

  test("worker mints a req_* trace for unstamped system ticks", async () => {
    let seen: ReturnType<typeof getTrace>;
    const onReleaseHolds = mock(async () => {
      seen = getTrace();
      return { released: 0 };
    });
    makeService({ onReleaseHolds });

    await capturedJobHandler!({
      id: "j2",
      name: "release-expired-holds",
      data: {},
    });
    expect(seen?.traceId).toMatch(/^req_/);
  });

  test("failed/completed events carry the job trace", async () => {
    makeService();

    logCaptures = [];
    capturedFailedHandler!(
      { name: "expire-bookings", data: { traceId: "req_f1" } },
      new Error("boom"),
    );
    const failed = logCaptures.find(
      (c: any) => c.action === "scheduler_job_failed",
    );
    expect(failed?.traceId).toBe("req_f1");

    logCaptures = [];
    capturedCompletedHandler!({
      name: "expire-bookings",
      data: { traceId: "req_c1", userId: "u_c1" },
    });
    const completed = logCaptures.find(
      (c: any) => c.action === "scheduler_job_completed",
    );
    expect(completed?.traceId).toBe("req_c1");
    expect(completed?.userId).toBe("u_c1");
  });
});
