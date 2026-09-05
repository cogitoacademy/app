import { Queue, Worker, type Job } from "bullmq";
import { log } from "../../lib/logger";
import { generateRequestId } from "../../lib/request-id";
import { runWithTrace, type TraceCtx } from "../../lib/trace";

const QUEUE_NAME = "cogito-jobs";
// N2: bound the completed/failed job records BullMQ keeps in Redis. Without
// these, every repeatable tick (5m/10m/60s) accumulates a completed record
// forever. Keep the last ~100 completed / last ~50 failed, and drop records
// older than 24h / 7d respectively.
export const JOB_RETENTION = {
  removeOnComplete: { age: 24 * 3600, count: 100 },
  removeOnFail: { age: 7 * 24 * 3600, count: 50 },
} as const;
// M4: dead-letter queue — jobs whose attempts are exhausted land here instead
// of vanishing. A dedicated worker logs each entry and keeps a bounded Redis
// list (cogito:dlq) for quick inspection.
const DLQ_QUEUE_NAME = "cogito-jobs-dlq";
export const DLQ_LIST_KEY = "cogito:dlq";
const DLQ_LIST_MAX = 100;
// Atomic bounded push: LPUSH then LTRIM to the last DLQ_LIST_MAX entries.
const DLQ_PUSH_LUA = `
redis.call('LPUSH', KEYS[1], ARGV[1])
return redis.call('LTRIM', KEYS[1], 0, ARGV[2] - 1)
`;

export interface SchedulerHandlers {
  onExpireBookings: () => Promise<{ expired: number; failed: number }>;
  onReleaseHolds: () => Promise<{ released: number }>;
  onCheckTutorLateness: () => Promise<{
    flagged: number;
    failed: number;
  }>;
  onSendNotificationEmail: () => Promise<{ sent: number; failed: number }>;
  onEscalateSupportTickets: () => Promise<{ escalated: number }>;
  onRetryFailedMeetings: () => Promise<{ succeeded: number; failed: number }>;
}

export interface SchedulerService {
  queue: Queue;
  worker: Worker;
  dlqQueue: Queue;
  dlqWorker: Worker;
}

export function createSchedulerService(
  redisUrl: string,
  handlers: SchedulerHandlers,
): SchedulerService | null {
  if (!redisUrl) return null;

  const connection = { url: redisUrl };

  // M4: DLQ queue + worker. Created before the main worker so the main
  // worker's handler stays the "current" one for callers. The DLQ queue
  // inherits JOB_RETENTION so permanent-failure records cannot accumulate
  // unbounded in Redis (the DLQ Redis list is bounded separately).
  const dlqQueue = new Queue(DLQ_QUEUE_NAME, {
    connection,
    defaultJobOptions: JOB_RETENTION,
  });

  const dlqWorker = new Worker(
    DLQ_QUEUE_NAME,
    async (job: Job) => {
      // T1: the DLQ payload nests the original job data under `data`
      // (see the failed-handler copy above); surface the original trace.
      const dlqOuter = (job.data ?? {}) as {
        traceId?: string;
        userId?: string;
        data?: { traceId?: string; userId?: string };
      };
      log({
        level: "error",
        action: "scheduler_dlq_job",
        message: `Job ${job.name} moved to DLQ after attempts exhausted`,
        traceId: dlqOuter.data?.traceId ?? dlqOuter.traceId,
        userId: dlqOuter.data?.userId ?? dlqOuter.userId,
        job: { id: job.id, name: job.name, data: job.data },
      });

      // Keep a bounded Redis list of DLQ entries for quick inspection. Each
      // entry carries `failedAt` (epoch ms, stamped at push time) so the
      // health check can distinguish fresh failures from a stale ledger —
      // `/health` `dlqDepth` counts only entries inside the freshness window
      // (see `DLQ_FRESH_WINDOW_MS` in db-health.ts).
      try {
        const client = await dlqQueue.backend.client;
        client.defineCommand("cogitoDlqPush", {
          numberOfKeys: 1,
          lua: DLQ_PUSH_LUA,
        });
        await client.runCommand("cogitoDlqPush", [
          DLQ_LIST_KEY,
          JSON.stringify({
            failedAt: Date.now(),
            ...job.data,
          }),
          String(DLQ_LIST_MAX),
        ]);
      } catch (error) {
        log({
          level: "warn",
          action: "scheduler_dlq_list_failed",
          error: { message: String(error) },
        });
      }
    },
    { connection },
  );

  const queue = new Queue(QUEUE_NAME, {
    connection,
    // N2: queue-level default so every current and future job inherits bounded
    // completed/failed retention (see JOB_RETENTION).
    defaultJobOptions: JOB_RETENTION,
  });

  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      // T1: run every job inside the stamped trace scope (or a fresh id for
      // system ticks) so downstream services correlate via getTrace(), and
      // log traceId/userId on start/complete/fail for Loki correlation.
      const stamped = (job.data ?? {}) as {
        traceId?: string;
        userId?: string;
      };
      const ctx: TraceCtx = {
        traceId: stamped.traceId ?? generateRequestId(),
        userId: stamped.userId,
      };
      return runWithTrace(ctx, async () => {
        log({
          level: "info",
          action: "scheduler_job_start",
          message: `Processing job ${job.name}`,
          traceId: ctx.traceId,
          userId: ctx.userId,
          job: { id: job.id, name: job.name, data: job.data },
        });

        switch (job.name) {
          case "expire-bookings":
            const expireResult = await handlers.onExpireBookings();
            log({
              level: expireResult.failed > 0 ? "warn" : "info",
              action: "expire_bookings_complete",
              message: `Expired ${expireResult.expired} bookings, ${expireResult.failed} failed`,
              traceId: ctx.traceId,
              userId: ctx.userId,
              ...expireResult,
            });
            return expireResult;
          case "release-expired-holds":
            const releaseResult = await handlers.onReleaseHolds();
            log({
              level: "info",
              action: "release_expired_holds_complete",
              message: `Released ${releaseResult.released} holds`,
              traceId: ctx.traceId,
              userId: ctx.userId,
            });
            return releaseResult;
          case "check-tutor-lateness":
            const latenessResult = await handlers.onCheckTutorLateness();
            log({
              level: latenessResult.failed > 0 ? "warn" : "info",
              action: "check_tutor_lateness_complete",
              message: `Flagged ${latenessResult.flagged} bookings for tutor lateness review, ${latenessResult.failed} failed`,
              traceId: ctx.traceId,
              userId: ctx.userId,
              ...latenessResult,
            });
            return latenessResult;
          case "send-notification-email":
            const sendResult = await handlers.onSendNotificationEmail();
            log({
              level: "info",
              action: "send_notification_email_complete",
              message: `Dispatched ${sendResult.sent} emails, ${sendResult.failed} failed`,
              traceId: ctx.traceId,
              userId: ctx.userId,
              ...sendResult,
            });
            return sendResult;
          case "retry-failed-meetings":
            const meetingResult = await handlers.onRetryFailedMeetings();
            log({
              level: meetingResult.failed > 0 ? "warn" : "info",
              action: "retry_failed_meetings_complete",
              message: `Scheduled ${meetingResult.succeeded} bookings after meeting retry, ${meetingResult.failed} still failing`,
              traceId: ctx.traceId,
              userId: ctx.userId,
              ...meetingResult,
            });
            return meetingResult;
          case "escalate-support-tickets":
            const escalateResult = await handlers.onEscalateSupportTickets();
            log({
              level: "info",
              action: "escalate_support_tickets_complete",
              message: `Escalated ${escalateResult.escalated} support tickets past SLA`,
              traceId: ctx.traceId,
              userId: ctx.userId,
              ...escalateResult,
            });
            return escalateResult;
          default:
            log({
              level: "warn",
              action: "scheduler_unknown_job",
              message: `Unknown job: ${job.name}`,
              traceId: ctx.traceId,
              userId: ctx.userId,
            });
        }
      });
    },
    { connection },
  );

  worker.on("failed", (job, err) => {
    const failedStamped = (job?.data ?? {}) as {
      traceId?: string;
      userId?: string;
    };
    log({
      level: "error",
      action: "scheduler_job_failed",
      message: `Job ${job?.name ?? "unknown"} failed`,
      traceId: failedStamped.traceId,
      userId: failedStamped.userId,
      error: { message: err.message, stack: err.stack },
    });

    // M4: after attempts are exhausted the job would vanish — move it to the
    // DLQ so it is logged, kept in the bounded Redis list, and can be
    // replayed manually if needed.
    const maxAttempts = job?.opts?.attempts ?? 1;
    if (job && job.attemptsMade >= maxAttempts) {
      dlqQueue
        .add(job.name, {
          originalJobId: job.id,
          attemptsMade: job.attemptsMade,
          failedReason: err.message,
          data: job.data,
        })
        .catch((error) => {
          log({
            level: "warn",
            action: "scheduler_dlq_add_failed",
            error: { message: String(error) },
          });
        });
    }
  });

  worker.on("completed", (job) => {
    const completedStamped = (job?.data ?? {}) as {
      traceId?: string;
      userId?: string;
    };
    log({
      level: "info",
      action: "scheduler_job_completed",
      message: `Job ${job.name} completed`,
      traceId: completedStamped.traceId,
      userId: completedStamped.userId,
    });
  });

  return { queue, worker, dlqQueue, dlqWorker };
}
