import type { Queue } from "bullmq";
import { JOB_RETENTION } from "../scheduler.service";
import { traceJobData } from "../../../lib/trace";

const JOB_NAME = "reconcile-payments";
const REPEAT_INTERVAL_MS = 15 * 60 * 1000;

export async function scheduleReconcilePayments(queue: Queue): Promise<void> {
  await queue.upsertJobScheduler(
    JOB_NAME,
    { every: REPEAT_INTERVAL_MS },
    {
      name: JOB_NAME,
      data: traceJobData(),
      opts: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5_000 },
        ...JOB_RETENTION,
      },
    },
  );
}
