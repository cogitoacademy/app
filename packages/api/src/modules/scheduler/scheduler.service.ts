import { Queue, Worker, type Job } from "bullmq";
import { log } from "../../lib/logger";

const QUEUE_NAME = "cogito-jobs";

export interface SchedulerHandlers {
  onExpireBookings: () => Promise<{ expired: number; failed: number }>;
  onReleaseHolds: () => Promise<{ released: number }>;
  onCheckTutorLateness: () => Promise<{
    autoCancelled: number;
    failed: number;
  }>;
  onSendNotificationEmail: () => Promise<{ sent: number; failed: number }>;
  onEscalateSupportTickets: () => Promise<{ escalated: number }>;
}

export interface SchedulerService {
  queue: Queue;
  worker: Worker;
}

export function createSchedulerService(
  redisUrl: string,
  handlers: SchedulerHandlers,
): SchedulerService | null {
  if (!redisUrl) return null;

  const connection = { url: redisUrl };

  const queue = new Queue(QUEUE_NAME, { connection });

  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      log({
        level: "info",
        action: "scheduler_job_start",
        message: `Processing job ${job.name}`,
        job: { id: job.id, name: job.name, data: job.data },
      });

      switch (job.name) {
        case "expire-bookings":
          const expireResult = await handlers.onExpireBookings();
          log({
            level: expireResult.failed > 0 ? "warn" : "info",
            action: "expire_bookings_complete",
            message: `Expired ${expireResult.expired} bookings, ${expireResult.failed} failed`,
            ...expireResult,
          });
          return expireResult;
        case "release-expired-holds":
          const releaseResult = await handlers.onReleaseHolds();
          log({
            level: "info",
            action: "release_expired_holds_complete",
            message: `Released ${releaseResult.released} holds`,
          });
          return releaseResult;
        case "check-tutor-lateness":
          const latenessResult = await handlers.onCheckTutorLateness();
          log({
            level: latenessResult.failed > 0 ? "warn" : "info",
            action: "check_tutor_lateness_complete",
            message: `Auto-cancelled ${latenessResult.autoCancelled} bookings for tutor lateness, ${latenessResult.failed} failed`,
            ...latenessResult,
          });
          return latenessResult;
        case "send-notification-email":
          const sendResult = await handlers.onSendNotificationEmail();
          log({
            level: "info",
            action: "send_notification_email_complete",
            message: `Dispatched ${sendResult.sent} emails, ${sendResult.failed} failed`,
            ...sendResult,
          });
          return sendResult;
        case "escalate-support-tickets":
          const escalateResult = await handlers.onEscalateSupportTickets();
          log({
            level: "info",
            action: "escalate_support_tickets_complete",
            message: `Escalated ${escalateResult.escalated} support tickets past SLA`,
            ...escalateResult,
          });
          return escalateResult;
        default:
          log({
            level: "warn",
            action: "scheduler_unknown_job",
            message: `Unknown job: ${job.name}`,
          });
      }
    },
    { connection },
  );

  worker.on("failed", (job, err) => {
    log({
      level: "error",
      action: "scheduler_job_failed",
      message: `Job ${job?.name ?? "unknown"} failed`,
      error: { message: err.message, stack: err.stack },
    });
  });

  worker.on("completed", (job) => {
    log({
      level: "info",
      action: "scheduler_job_completed",
      message: `Job ${job.name} completed`,
    });
  });

  return { queue, worker };
}
