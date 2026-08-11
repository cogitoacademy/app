import { describe, expect, mock, test } from "bun:test";
import { scheduleSendNotificationEmail } from "../../modules/scheduler/jobs/send-notification-email.job";

describe("scheduleSendNotificationEmail", () => {
  test("upserts a scheduler with retry and backoff options", async () => {
    const upsertJobScheduler = mock(async () => ({}));
    const queue = { upsertJobScheduler } as any;

    await scheduleSendNotificationEmail(queue);

    expect(upsertJobScheduler).toHaveBeenCalledWith(
      "send-notification-email",
      { every: 60_000 },
      {
        name: "send-notification-email",
        data: {},
        opts: {
          attempts: 3,
          backoff: { type: "exponential", delay: 1000 },
        },
      },
    );
  });
});
