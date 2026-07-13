import { describe, test, expect, mock } from "bun:test";
import { scheduleHoldReleaseCheck } from "../../modules/scheduler/jobs/release-holds.job";

describe("scheduleHoldReleaseCheck", () => {
  test("adds repeat job with correct name and interval", async () => {
    const mockAdd = mock(async () => ({}));
    const queue = { add: mockAdd } as any;

    await scheduleHoldReleaseCheck(queue);

    expect(mockAdd).toHaveBeenCalledTimes(1);
    expect(mockAdd).toHaveBeenCalledWith(
      "release-expired-holds",
      {},
      {
        repeat: { every: 10 * 60 * 1000 },
      },
    );
  });
});
