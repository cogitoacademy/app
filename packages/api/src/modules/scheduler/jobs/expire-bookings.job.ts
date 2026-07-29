import type { Queue } from "bullmq";

const JOB_NAME = "expire-bookings";
const REPEAT_INTERVAL_MS = 5 * 60 * 1000;

export async function scheduleBookingExpiryCheck(queue: Queue): Promise<void> {
  await queue.add(
    JOB_NAME,
    {},
    {
      repeat: { every: REPEAT_INTERVAL_MS },
      jobId: JOB_NAME,
      attempts: 3,
      backoff: { type: "exponential", delay: 1000 },
    },
  );
}
