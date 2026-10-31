import { describe, expect, test } from "bun:test";
import {
  createTestClassMeetingProvider,
  updateTestClassMeetingEvent,
} from "../../modules/meeting/test-class-meeting.provider";

describe("test academy-class meeting provider", () => {
  test("a retry cannot silently replace an accepted controlled event", async () => {
    const provider = createTestClassMeetingProvider({
      failFirstTitlePrefix: "RETRY:",
    });
    const startAt = new Date("2035-02-01T10:00:00Z");
    const endAt = new Date("2035-02-01T11:00:00Z");
    await provider("session1", startAt, endAt, undefined, {
      title: "RETRY: class",
    });
    expect(await provider("session1", startAt, endAt)).toMatchObject({
      status: "failed",
      externalEventId: "test-class-event-session1",
      errorReason: "Retry did not resume the original controlled event",
    });
    expect(
      await createTestClassMeetingProvider()("session2", startAt, endAt),
    ).toMatchObject({
      status: "created",
      externalEventId: "test-class-event-session2",
    });
    expect(
      await createTestClassMeetingProvider()(
        "session3",
        startAt,
        endAt,
        undefined,
        { title: "Class", externalEventId: "existing-event" },
      ),
    ).toMatchObject({ status: "created", externalEventId: "existing-event" });
  });

  test("controlled calendar updates reject events outside the synthetic namespace", async () => {
    const now = new Date();
    await expect(
      updateTestClassMeetingEvent(
        "test-class-event-session1",
        "session1",
        now,
        now,
      ),
    ).resolves.toBeUndefined();
    await expect(
      updateTestClassMeetingEvent("real-event", "session1", now, now),
    ).rejects.toThrow("non-synthetic class event");
  });
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
