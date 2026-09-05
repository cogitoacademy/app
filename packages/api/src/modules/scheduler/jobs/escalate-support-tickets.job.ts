import type { Queue } from "bullmq";
import { traceJobData } from "../../../lib/trace";
import { JOB_RETENTION } from "../scheduler.service";

const JOB_NAME = "escalate-support-tickets";
const REPEAT_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Registers the repeatable support-ticket SLA escalation job. The job carries
 * only the trace stamp (`traceJobData`): the worker calls the support
 * service's `escalatePastSlaTickets`, which marks tickets past `slaDeadline`
 * as escalated (in_progress) and audits each.
 */
export async function scheduleEscalateSupportTickets(
  queue: Queue,
): Promise<void> {
  await queue.upsertJobScheduler(
    JOB_NAME,
    { every: REPEAT_INTERVAL_MS },
    {
      name: JOB_NAME,
      data: traceJobData(),
      opts: {
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
        ...JOB_RETENTION,
      },
    },
  );
}
