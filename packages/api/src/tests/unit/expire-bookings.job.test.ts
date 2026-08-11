import { describe, test, expect, mock } from "bun:test";
import { scheduleBookingExpiryCheck } from "../../modules/scheduler/jobs/expire-bookings.job";

describe("scheduleBookingExpiryCheck", () => {
  test("upserts a scheduler with the correct name and interval", async () => {
    const upsertJobScheduler = mock(async () => ({}));
    const queue = { upsertJobScheduler } as any;

    await scheduleBookingExpiryCheck(queue);

    expect(upsertJobScheduler).toHaveBeenCalledTimes(1);
    expect(upsertJobScheduler).toHaveBeenCalledWith(
      "expire-bookings",
      { every: 5 * 60 * 1000 },
      {
        name: "expire-bookings",
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

    await scheduleBookingExpiryCheck(queue);

    const opts = upsertJobScheduler.mock.calls[0][2].opts;
    expect(opts.attempts).toBe(3);
  });
});
