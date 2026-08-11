import type { Queue } from "bullmq";

const JOB_NAME = "release-expired-holds";
const REPEAT_INTERVAL_MS = 10 * 60 * 1000;

export async function scheduleHoldReleaseCheck(queue: Queue): Promise<void> {
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
