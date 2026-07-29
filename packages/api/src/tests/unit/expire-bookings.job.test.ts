import { describe, test, expect, mock } from "bun:test";
import { scheduleBookingExpiryCheck } from "../../modules/scheduler/jobs/expire-bookings.job";

describe("scheduleBookingExpiryCheck", () => {
  test("adds repeat job with correct name and interval", async () => {
    const mockAdd = mock(async () => ({}));
    const queue = { add: mockAdd } as any;

    await scheduleBookingExpiryCheck(queue);

    expect(mockAdd).toHaveBeenCalledTimes(1);
    expect(mockAdd).toHaveBeenCalledWith(
      "expire-bookings",
      {},
      {
        repeat: { every: 5 * 60 * 1000 },
        jobId: "expire-bookings",
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
      },
    );
  });

  test("includes retry attempts option", async () => {
    const mockAdd = mock(async () => ({}));
    const queue = { add: mockAdd } as any;

    await scheduleBookingExpiryCheck(queue);

    const opts = mockAdd.mock.calls[0][2];
    expect(opts.attempts).toBe(3);
  });
});
