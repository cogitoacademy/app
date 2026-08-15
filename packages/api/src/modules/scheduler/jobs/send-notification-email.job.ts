import type { Queue } from "bullmq";

const JOB_NAME = "send-notification-email";
const REPEAT_INTERVAL_MS = 60_000;

/**
 * Registers the repeatable email-outbox consumer job. The job carries no data:
 * the worker calls the notification service's `dispatchQueuedEmails` consumer,
 * which picks up queued dispatch rows from the database.
 */
export async function scheduleSendNotificationEmail(
  queue: Queue,
): Promise<void> {
  await queue.upsertJobScheduler(
    JOB_NAME,
    { every: REPEAT_INTERVAL_MS },
    {
      name: JOB_NAME,
      data: {},
      opts: {
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
      },
    },
  );
}
