import { describe, expect, test } from "bun:test";
import { createTestClassMeetingProvider } from "../../modules/meeting/test-class-meeting.provider";

describe("test academy-class meeting provider", () => {
  test("keeps an accepted event retryable until its Meet link is ready", async () => {
    const provider = createTestClassMeetingProvider({
      failFirstTitlePrefix: "E2E RETRY: ",
    });
    const startAt = new Date("2035-02-01T10:00:00.000Z");
    const endAt = new Date("2035-02-01T11:00:00.000Z");
    const options = {
      title: "E2E RETRY: controlled class session",
    };

    const first = await provider(
      "session-retry-once",
      startAt,
      endAt,
      undefined,
      options,
    );
    const retry = await provider(
      "session-retry-once",
      startAt,
      endAt,
      undefined,
      { ...options, externalEventId: first.externalEventId ?? undefined },
    );
    const repeated = await provider(
      "session-retry-once",
      startAt,
      endAt,
      undefined,
      { ...options, externalEventId: retry.externalEventId ?? undefined },
    );

    expect(first.status).toBe("failed");
    expect(first.externalEventId).toBe("test-class-event-session-retry-once");
    expect(retry.status).toBe("created");
    expect(retry.externalEventId).toBe(first.externalEventId);
    expect(repeated).toEqual(retry);
  });
});
