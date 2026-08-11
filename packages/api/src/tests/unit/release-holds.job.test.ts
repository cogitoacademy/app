import { describe, test, expect, mock } from "bun:test";
import { scheduleHoldReleaseCheck } from "../../modules/scheduler/jobs/release-holds.job";

describe("scheduleHoldReleaseCheck", () => {
  test("upserts a scheduler with the correct name and interval", async () => {
    const upsertJobScheduler = mock(async () => ({}));
    const queue = { upsertJobScheduler } as any;

    await scheduleHoldReleaseCheck(queue);

    expect(upsertJobScheduler).toHaveBeenCalledTimes(1);
    expect(upsertJobScheduler).toHaveBeenCalledWith(
      "release-expired-holds",
      { every: 10 * 60 * 1000 },
      {
        name: "release-expired-holds",
        data: {},
        opts: {
          attempts: 3,
          backoff: { type: "exponential", delay: 1000 },
        },
      },
    );
  });

  test("includes retry attempts option", async () => {
    const upsertJobScheduler = mock(async () => ({}));
    const queue = { upsertJobScheduler } as any;

    await scheduleHoldReleaseCheck(queue);

    const opts = upsertJobScheduler.mock.calls[0][2].opts;
    expect(opts.attempts).toBe(3);
  });
});
