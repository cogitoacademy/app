import type { Queue } from "bullmq";

const JOB_NAME = "send-notification-email";
const REPEAT_INTERVAL_MS = 60_000;

export async function scheduleSendNotificationEmail(
  queue: Queue,
): Promise<void> {
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