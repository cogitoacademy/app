import { describe, test, expect, mock } from "bun:test";
import { scheduleCheckTutorLateness } from "../../modules/scheduler/jobs/check-tutor-lateness.job";

describe("scheduleCheckTutorLateness", () => {
  test("upserts a scheduler with the correct name and interval", async () => {
    const upsertJobScheduler = mock(async () => ({}));
    const queue = { upsertJobScheduler } as any;

    await scheduleCheckTutorLateness(queue);

    expect(upsertJobScheduler).toHaveBeenCalledTimes(1);
    expect(upsertJobScheduler).toHaveBeenCalledWith(
      "check-tutor-lateness",
      { every: 5 * 60 * 1000 },
      {
        name: "check-tutor-lateness",
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

    await scheduleCheckTutorLateness(queue);

    const opts = upsertJobScheduler.mock.calls[0][2].opts;
    expect(opts.attempts).toBe(3);
  });
});
