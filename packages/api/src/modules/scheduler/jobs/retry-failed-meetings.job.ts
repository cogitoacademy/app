import type { Queue } from "bullmq";

const JOB_NAME = "retry-failed-meetings";
const REPEAT_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Registers the repeatable job that retries Google Meet creation for confirmed
 * online bookings whose previous attempt failed (up to 3 attempts per booking).
 *
 * @param queue - the BullMQ queue to register the repeatable job on
 */
export async function scheduleRetryFailedMeetings(queue: Queue): Promise<void> {
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
