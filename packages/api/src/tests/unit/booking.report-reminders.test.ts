import { describe, expect, test } from "bun:test";
import type { DbType } from "../../lib/db";
import type { TxClient } from "../../lib/tx";
import type {
  NotificationService,
  NotificationWriteParams,
} from "../../modules/notification/notification.service";
import {
  bookingReportReminderEventKey,
  bookingReportReminderPeriod,
  createBookingReportReminderProcessor,
  type BookingReportReminderRepo,
  type LegacyBookingReportReminderCandidate,
} from "../../modules/booking/booking.report-reminders";
import { notificationEmailHtml } from "../../modules/notification/notification.service";

const DAY_MS = 24 * 60 * 60 * 1000;

type FakeSession = {
  id: string;
  state: "scheduled" | "completed" | "cancelled" | "no_show";
  completed: boolean;
  reportSubmitted: boolean;
  scheduledStartAt: Date;
  scheduledEndAt: Date;
};

type FakeBooking = {
  id: string;
  type: "solo" | "group" | "series";
  tutorId: string;
  state: "scheduled" | "completed" | "cancelled" | "no_show";
  completed: boolean;
  reportSubmitted: boolean;
  scheduledStartAt: Date;
  scheduledEndAt: Date;
  participantNoShows?: number;
  sessions?: FakeSession[];
};

function makeBooking(
  id: string,
  type: FakeBooking["type"],
  endAt: Date,
  tutorId = `tutor-${id}`,
): FakeBooking {
  return {
    id,
    type,
    tutorId,
    state: "scheduled",
    completed: false,
    reportSubmitted: false,
    scheduledStartAt: new Date(endAt.getTime() - 60 * 60 * 1000),
    scheduledEndAt: endAt,
    ...(type === "series" ? { sessions: [] } : {}),
  };
}

function makeSeriesSession(id: string, endAt: Date): FakeSession {
  return {
    id,
    state: "scheduled",
    completed: false,
    reportSubmitted: false,
    scheduledStartAt: new Date(endAt.getTime() - 60 * 60 * 1000),
    scheduledEndAt: endAt,
  };
}

function makeRepo(rows: FakeBooking[]) {
  const recordedKeys = new Set<string>();
  let afterFind: (() => void) | undefined;
  const repo: BookingReportReminderRepo = {
    async findDue(_db, nowAt, limit) {
      const candidates: LegacyBookingReportReminderCandidate[] = [];
      for (const row of rows) {
        if (row.state !== "scheduled" || row.completed) continue;
        if (row.type !== "series") {
          const period = bookingReportReminderPeriod(row.scheduledEndAt, nowAt);
          if (
            row.reportSubmitted ||
            period === null ||
            recordedKeys.has(
              bookingReportReminderEventKey(row.id, null, period),
            )
          ) {
            continue;
          }
          candidates.push({
            bookingId: row.id,
            bookingType: row.type,
            tutorId: row.tutorId,
            sessionId: null,
            scheduledStartAt: row.scheduledStartAt,
            scheduledEndAt: row.scheduledEndAt,
          });
          continue;
        }

        for (const session of row.sessions ?? []) {
          const period = bookingReportReminderPeriod(
            session.scheduledEndAt,
            nowAt,
          );
          if (
            session.state !== "scheduled" ||
            session.completed ||
            session.reportSubmitted ||
            period === null ||
            recordedKeys.has(
              bookingReportReminderEventKey(row.id, session.id, period),
            )
          ) {
            continue;
          }
          candidates.push({
            bookingId: row.id,
            bookingType: "series",
            tutorId: row.tutorId,
            sessionId: session.id,
            scheduledStartAt: session.scheduledStartAt,
            scheduledEndAt: session.scheduledEndAt,
          });
        }
      }

      const selected = candidates
        .toSorted(
          (left, right) =>
            left.scheduledEndAt.getTime() - right.scheduledEndAt.getTime() ||
            left.bookingId.localeCompare(right.bookingId) ||
            (left.sessionId ?? "").localeCompare(right.sessionId ?? ""),
        )
        .slice(0, limit);
      afterFind?.();
      afterFind = undefined;
      return selected;
    },
    async writeIfPending(_db, candidate, nowAt, eventKey, write) {
      const row = rows.find((item) => item.id === candidate.bookingId);
      if (
        !row ||
        row.type !== candidate.bookingType ||
        row.tutorId !== candidate.tutorId ||
        row.state !== "scheduled" ||
        row.completed
      ) {
        return false;
      }

      const session = candidate.sessionId
        ? row.sessions?.find((item) => item.id === candidate.sessionId)
        : null;
      if (candidate.bookingType === "series") {
        if (
          !session ||
          session.state !== "scheduled" ||
          session.completed ||
          session.reportSubmitted
        ) {
          return false;
        }
      } else if (candidate.sessionId !== null || row.reportSubmitted) {
        return false;
      }

      const scheduledStartAt =
        session?.scheduledStartAt ?? row.scheduledStartAt;
      const scheduledEndAt = session?.scheduledEndAt ?? row.scheduledEndAt;
      const period = bookingReportReminderPeriod(scheduledEndAt, nowAt);
      if (
        scheduledStartAt.getTime() !== candidate.scheduledStartAt.getTime() ||
        scheduledEndAt.getTime() !== candidate.scheduledEndAt.getTime() ||
        period === null ||
        eventKey !==
          bookingReportReminderEventKey(
            candidate.bookingId,
            session?.id ?? null,
            period,
          ) ||
        recordedKeys.has(eventKey)
      ) {
        return false;
      }

      await write({} as TxClient);
      recordedKeys.add(eventKey);
      return true;
    },
  };

  return {
    repo,
    recordedKeys,
    beforeWriteIfPending(callback: () => void) {
      afterFind = callback;
    },
  };
}

function makeProcessor(
  repo: BookingReportReminderRepo,
  notification: Pick<NotificationService, "write">,
  clock: () => Date,
) {
  return createBookingReportReminderProcessor({
    db: {} as DbType,
    repo,
    notification,
    appBaseUrl: "https://cogito.example/",
    clock,
  });
}

describe("legacy booking missing-report reminders", () => {
  test("starts at session end and repeats on 24-hour elapsed boundaries", () => {
    const endAt = new Date("2026-10-21T03:00:00.000Z");
    expect(
      bookingReportReminderPeriod(endAt, new Date(endAt.getTime() - 1)),
    ).toBe(null);
    expect(bookingReportReminderPeriod(endAt, endAt)).toBe(0);
    expect(
      bookingReportReminderPeriod(
        endAt,
        new Date(endAt.getTime() + DAY_MS - 1),
      ),
    ).toBe(0);
    expect(
      bookingReportReminderPeriod(endAt, new Date(endAt.getTime() + DAY_MS)),
    ).toBe(1);
    expect(bookingReportReminderEventKey("b1", null, 1)).toBe(
      "booking:b1:session:booking:missing-report:day:1",
    );
    expect(bookingReportReminderEventKey("b1", "s2", 1)).toBe(
      "booking:b1:session:s2:missing-report:day:1",
    );
  });

  test("catches up only the current period and survives worker restart", async () => {
    const endAt = new Date("2026-10-01T00:00:00.000Z");
    let nowAt = new Date(endAt.getTime() + 5 * DAY_MS);
    const group = makeBooking("group-1", "group", endAt, "tutor-1");
    group.participantNoShows = 2;
    const fake = makeRepo([group]);
    const writes: NotificationWriteParams[] = [];
    const notification = {
      async write(params: NotificationWriteParams) {
        writes.push(params);
      },
    };

    expect(
      await makeProcessor(
        fake.repo,
        notification,
        () => nowAt,
      ).processPendingReportReminders(),
    ).toMatchObject({ queued: 1, failed: 0 });
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      userId: "tutor-1",
      bookingId: "group-1",
      eventKey: bookingReportReminderEventKey("group-1", null, 5),
      metadata: {
        action: "booking-session-report",
        actionUrl: "https://cogito.example/bookings/group-1",
      },
    });
    expect(writes[0]?.body).toContain("only if it was delivered");

    expect(
      await makeProcessor(
        fake.repo,
        notification,
        () => nowAt,
      ).processPendingReportReminders(),
    ).toMatchObject({ checked: 0, queued: 0 });
    nowAt = new Date(nowAt.getTime() + DAY_MS);
    expect(
      await makeProcessor(
        fake.repo,
        notification,
        () => nowAt,
      ).processPendingReportReminders(),
    ).toMatchObject({ queued: 1 });
    expect(writes.map(({ eventKey }) => eventKey)).toEqual([
      bookingReportReminderEventKey("group-1", null, 5),
      bookingReportReminderEventKey("group-1", null, 6),
    ]);
  });

  test("rechecks report, cancellation, reschedule, and tutor ownership", async () => {
    const nowAt = new Date("2026-10-21T03:00:00.000Z");
    const reportArrives = makeBooking("reported", "solo", nowAt);
    const cancelled = makeBooking("cancelled", "solo", nowAt);
    const rescheduled = makeBooking("rescheduled", "solo", nowAt);
    const reassigned = makeBooking("reassigned", "solo", nowAt, "old-tutor");
    const groupAfterParticipantNoShow = makeBooking(
      "group-present",
      "group",
      nowAt,
      "group-tutor",
    );
    groupAfterParticipantNoShow.participantNoShows = 1;

    const fake = makeRepo([
      reportArrives,
      cancelled,
      rescheduled,
      reassigned,
      groupAfterParticipantNoShow,
      Object.assign(makeBooking("already-cancelled", "solo", nowAt), {
        state: "cancelled" as const,
      }),
      Object.assign(makeBooking("already-completed", "solo", nowAt), {
        state: "completed" as const,
      }),
      Object.assign(makeBooking("whole-session-no-show", "solo", nowAt), {
        state: "no_show" as const,
      }),
    ]);
    fake.beforeWriteIfPending(() => {
      reportArrives.reportSubmitted = true;
      cancelled.state = "cancelled";
      rescheduled.scheduledEndAt = new Date(nowAt.getTime() + 1);
      reassigned.tutorId = "new-tutor";
    });
    const writes: NotificationWriteParams[] = [];
    const processor = makeProcessor(
      fake.repo,
      {
        async write(params) {
          writes.push(params);
        },
      },
      () => nowAt,
    );

    expect(await processor.processPendingReportReminders()).toMatchObject({
      checked: 5,
      queued: 1,
      skipped: 4,
      failed: 0,
    });
    expect(writes).toHaveLength(1);
    expect(writes[0]?.userId).toBe("group-tutor");
    // A no-show participant does not mean the tutor failed to deliver a group
    // session to its remaining participants.
    expect(writes[0]?.bookingId).toBe("group-present");
  });

  test("series reminders use one independent identity per eligible child", async () => {
    const nowAt = new Date("2026-10-21T03:00:00.000Z");
    const series = makeBooking("series-1", "series", nowAt, "tutor-series");
    const first = makeSeriesSession("session-1", nowAt);
    const second = makeSeriesSession("session-2", nowAt);
    const noShow = makeSeriesSession("session-no-show", nowAt);
    noShow.state = "no_show";
    const completed = makeSeriesSession("session-completed", nowAt);
    completed.state = "completed";
    completed.completed = true;
    series.sessions = [first, second, noShow, completed];
    const fake = makeRepo([series]);
    const writes: NotificationWriteParams[] = [];
    const processor = makeProcessor(
      fake.repo,
      {
        async write(params) {
          writes.push(params);
        },
      },
      () => nowAt,
    );

    expect(await processor.processPendingReportReminders()).toMatchObject({
      checked: 2,
      queued: 2,
    });
    expect(writes.map(({ eventKey }) => eventKey)).toEqual([
      bookingReportReminderEventKey("series-1", "session-1", 0),
      bookingReportReminderEventKey("series-1", "session-2", 0),
    ]);
    expect(writes.map(({ userId }) => userId)).toEqual([
      "tutor-series",
      "tutor-series",
    ]);
  });

  test("caps each scheduler pass at 100 bookings or series sessions", async () => {
    const nowAt = new Date("2026-10-21T03:00:00.000Z");
    const bookings = Array.from({ length: 101 }, (_, index) =>
      makeBooking(`b${index}`, "solo", nowAt),
    );
    const fake = makeRepo(bookings);
    let writes = 0;
    const processor = makeProcessor(
      fake.repo,
      {
        async write() {
          writes += 1;
        },
      },
      () => nowAt,
    );

    expect(await processor.processPendingReportReminders()).toMatchObject({
      checked: 100,
      queued: 100,
      failed: 0,
    });
    expect(writes).toBe(100);
  });

  test("retries a failed outbox write on the next scheduler pass", async () => {
    const nowAt = new Date("2026-10-21T03:00:00.000Z");
    const fake = makeRepo([makeBooking("retry", "solo", nowAt, "tutor-1")]);
    let failOnce = true;
    const writes: NotificationWriteParams[] = [];
    const notification = {
      async write(params: NotificationWriteParams) {
        writes.push(params);
        if (failOnce) {
          failOnce = false;
          throw new Error("notification outbox unavailable");
        }
      },
    };
    const processor = makeProcessor(fake.repo, notification, () => nowAt);

    expect(await processor.processPendingReportReminders()).toMatchObject({
      queued: 0,
      failed: 1,
    });
    expect(await processor.processPendingReportReminders()).toMatchObject({
      queued: 1,
      failed: 0,
    });
    expect(writes).toHaveLength(2);
  });

  test("email action links are escaped and accept only web URLs", () => {
    expect(
      notificationEmailHtml({
        body: "Review the ended booking before reporting.",
        metadata: {
          action: "booking-session-report",
          actionUrl: "https://cogito.example/bookings/b1?from=mail&next=1",
        },
      }),
    ).toContain(
      '<a href="https://cogito.example/bookings/b1?from=mail&amp;next=1">Open this booking</a>',
    );
    expect(
      notificationEmailHtml({
        body: "Review the ended booking before reporting.",
        metadata: {
          action: "booking-session-report",
          actionUrl: "javascript:alert(1)",
        },
      }),
    ).toBe("Review the ended booking before reporting.");
  });
});
