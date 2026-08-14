import { describe, expect, mock, test } from "bun:test";
import { scheduleEscalateSupportTickets } from "../../modules/scheduler/jobs/escalate-support-tickets.job";

describe("scheduleEscalateSupportTickets", () => {
  test("upserts a repeatable scheduler with retry and backoff options", async () => {
    const upsertJobScheduler = mock(async () => ({}));
    const queue = { upsertJobScheduler } as any;

    await scheduleEscalateSupportTickets(queue);

    expect(upsertJobScheduler).toHaveBeenCalledWith(
      "escalate-support-tickets",
      { every: 15 * 60 * 1000 },
      {
        name: "escalate-support-tickets",
        data: {},
        opts: {
          attempts: 3,
          backoff: { type: "exponential", delay: 1000 },
        },
      },
    );
  });
});
