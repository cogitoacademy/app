import type { Queue } from "bullmq";
import { JOB_RETENTION } from "../scheduler.service";

const JOB_NAME = "check-tutor-lateness";
const REPEAT_INTERVAL_MS = 5 * 60 * 1000;

export async function scheduleCheckTutorLateness(queue: Queue): Promise<void> {
  await queue.upsertJobScheduler(
    JOB_NAME,
    { every: REPEAT_INTERVAL_MS },
    {
      name: JOB_NAME,
      data: {},
      opts: {
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
        ...JOB_RETENTION,
      },
    },
  );
}
