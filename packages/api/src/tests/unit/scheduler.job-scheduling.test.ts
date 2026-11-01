import { expect, test } from "bun:test";
import type { Queue } from "bullmq";
import { scheduleClassEnrollmentCheck } from "../../modules/scheduler/jobs/class-enrollment-check.job";
import { JOB_RETENTION } from "../../modules/scheduler/scheduler.service";
import { scheduleReconcilePayments } from "../../modules/scheduler/jobs/reconcile-payments.job";
import { runWithTrace } from "../../lib/trace";

function queueFixture() {
  const calls: unknown[][] = [];
  const queue = {
    upsertJobScheduler: async (...args: unknown[]) => {
      calls.push(args);
    },
  } as unknown as Queue;
  return { queue, calls };
}

test("class enrollment check repeats each minute with retry, retention, and trace", async () => {
  const fixture = queueFixture();
  await runWithTrace(
    { traceId: "a".repeat(32), userId: "scheduler-user" },
    () => scheduleClassEnrollmentCheck(fixture.queue),
  );

  expect(fixture.calls).toEqual([
    [
      "class-enrollment-check",
      { every: 60_000 },
      {
        name: "class-enrollment-check",
        data: { traceId: "a".repeat(32), userId: "scheduler-user" },
        opts: {
          attempts: 3,
          backoff: { type: "exponential", delay: 2_000 },
          ...JOB_RETENTION,
        },
      },
    ],
  ]);
});

test("payment reconciliation repeats every fifteen minutes with system trace data", async () => {
  const fixture = queueFixture();
  await scheduleReconcilePayments(fixture.queue);

  expect(fixture.calls).toEqual([
    [
      "reconcile-payments",
      { every: 15 * 60_000 },
      {
        name: "reconcile-payments",
        data: {},
        opts: {
          attempts: 3,
          backoff: { type: "exponential", delay: 5_000 },
          ...JOB_RETENTION,
        },
      },
    ],
  ]);
});
