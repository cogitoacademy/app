import { describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/pg-proxy";
import type { DbType } from "../../lib/db";
import type { TxClient } from "../../lib/tx";
import type {
  NotificationService,
  NotificationWriteParams,
} from "../../modules/notification/notification.service";
import {
  bookingReportReminderEventKey,
  createBookingReportReminderProcessor,
  createBookingReportReminderRepo,
  type BookingReportReminderRepo,
  type LegacyBookingReportReminderCandidate,
} from "../../modules/booking/booking.report-reminders";
import { notificationEmailHtml } from "../../modules/notification/notification.service";

const DAY_MS = 24 * 60 * 60 * 1000;
test.each([0, -1])(
  "nonpositive reminder limits avoid database access (%s)",
  async (limit) => {
    const repo = createBookingReportReminderRepo();
    expect(await repo.findDue(undefined as never, new Date(), limit)).toEqual(
      [],
    );
  },
);

const epochSeconds = (date: Date) => String(date.getTime() / 1000);
const datePeriodForTest = (endAt: Date, nowAt: Date) => {
  const elapsed = nowAt.getTime() - endAt.getTime();
  return Number.isFinite(elapsed) && elapsed >= 0
    ? Math.floor(elapsed / DAY_MS)
    : null;
};

test("processor uses the SQL period when a sub-millisecond end is still before 24 hours", async () => {
  const queries: string[] = [];
  const database = drizzle(async (query) => {
    queries.push(query);
    return {
      rows: query.includes('inner join "booking_session"')
        ? []
        : [
            [
              "precision-booking",
              "solo",
              "precision-tutor",
              null,
              "2026-10-20 02:00:00+00",
              "2026-10-20 03:00:00.000500+00",
              "1792461600",
              "1792465200.0005",
              "0",
              "2026-10-20 03:00:00+00",
            ],
          ],
    };
  });
  const productionRepo = createBookingReportReminderRepo();
  const nowAt = new Date("2026-10-21T03:00:00.000Z");
  const writes: NotificationWriteParams[] = [];
  const eventKeys: string[] = [];
  const processor = createBookingReportReminderProcessor({
    db: database as unknown as DbType,
    repo: {
      findDue: productionRepo.findDue,
      async writeIfPending(_db, _candidate, _readAt, eventKey, write) {
        eventKeys.push(eventKey);
        await write({} as TxClient);
        return true;
      },
    },
    notification: {
      async write(params) {
        writes.push(params);
      },
    },
    appBaseUrl: "https://cogito.example",
    clock: () => nowAt,
  });

  expect(datePeriodForTest(new Date("2026-10-20T03:00:00.000Z"), nowAt)).toBe(
    1,
  );
  await processor.processPendingReportReminders();

  expect(queries.some((query) => query.includes("extract(epoch from"))).toBe(
    true,
  );
  expect(eventKeys).toEqual([
    "booking:precision-booking:session:booking:missing-report:day:0",
  ]);
  expect(writes.map(({ eventKey }) => eventKey)).toEqual(eventKeys);
});

test("SQL cursors decode normalized timestamps and bind an ISO timestamp boundary", async () => {
  const queries: Array<{ query: string; params: unknown[] }> = [];
  const database = drizzle(async (query, params) => {
    queries.push({ query, params });
    return {
      rows: query.includes('inner join "booking_session"')
        ? []
        : [
            [
              "cursor-booking",
              "solo",
              "tutor",
              null,
              "2026-10-23 02:00:00+00",
              "2026-10-23 03:00:00.000500+00",
              "1792720800",
              "1792724400.0005",
              "0",
              "2026-10-23 03:00:00+00",
            ],
          ],
    };
  });
  const repo = createBookingReportReminderRepo();
  const at = new Date("2026-10-23T04:00:00.000Z");
  const candidates = await repo.findDue(database as unknown as DbType, at, 100);
  const cursor = candidates[0];
  expect(cursor).toBeDefined();
  if (!cursor) throw new Error("Expected a decoded SQL cursor");
  expect(cursor.cursorScheduledEndAt).toBeInstanceOf(Date);
  expect(cursor.cursorScheduledEndAt.toISOString()).toBe(
    "2026-10-23T03:00:00.000Z",
  );
  await repo.findDue(database as unknown as DbType, at, 100, cursor);
  expect(queries).toHaveLength(4);
  expect(
    queries.every(({ query }) => query.includes("date_trunc('milliseconds'")),
  ).toBe(true);
  expect(
    queries
      .slice(2)
      .every(({ params }) => params.includes("2026-10-23T03:00:00.000Z")),
  ).toBe(true);
  expect(
    queries.every(({ params }) =>
      params.every((value) => !(value instanceof Date)),
    ),
  ).toBe(true);
});

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
    async findDue(_db, nowAt, limit, after) {
      const candidates: LegacyBookingReportReminderCandidate[] = [];
      for (const row of rows) {
        if (row.state !== "scheduled" || row.completed) continue;
        if (row.type !== "series") {
          const period = datePeriodForTest(row.scheduledEndAt, nowAt);
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
            scheduledStartAtEpoch: epochSeconds(row.scheduledStartAt),
            scheduledEndAtEpoch: epochSeconds(row.scheduledEndAt),
            reminderPeriod: period,
            cursorScheduledEndAt: row.scheduledEndAt,
          });
          continue;
        }

        for (const session of row.sessions ?? []) {
          const period = datePeriodForTest(session.scheduledEndAt, nowAt);
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
            scheduledStartAtEpoch: epochSeconds(session.scheduledStartAt),
            scheduledEndAtEpoch: epochSeconds(session.scheduledEndAt),
            reminderPeriod: period,
            cursorScheduledEndAt: session.scheduledEndAt,
          });
        }
      }

      const selected = candidates
        .toSorted(
          (left, right) =>
            left.cursorScheduledEndAt.getTime() -
              right.cursorScheduledEndAt.getTime() ||
            left.bookingId.localeCompare(right.bookingId) ||
            (left.sessionId ?? "").localeCompare(right.sessionId ?? ""),
        )
        .filter((candidate) => {
          if (!after) return true;
          return (
            candidate.cursorScheduledEndAt.getTime() >
              after.cursorScheduledEndAt.getTime() ||
            (candidate.cursorScheduledEndAt.getTime() ===
              after.cursorScheduledEndAt.getTime() &&
              (candidate.bookingId.localeCompare(after.bookingId) > 0 ||
                (candidate.bookingId === after.bookingId &&
                  (candidate.sessionId ?? "").localeCompare(
                    after.sessionId ?? "",
                  ) > 0)))
          );
        })
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
      const period = datePeriodForTest(scheduledEndAt, nowAt);
      if (
        epochSeconds(scheduledStartAt) !== candidate.scheduledStartAtEpoch ||
        epochSeconds(scheduledEndAt) !== candidate.scheduledEndAtEpoch ||
        period === null ||
        period !== candidate.reminderPeriod ||
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

function makeTransactionDb(resultSets: unknown[][]): DbType {
  const tx = {
    select: () => {
      const result = resultSets.shift() ?? [];
      const query = {
        from: () => query,
        where: () => query,
        for: async () => result,
        limit: async () => result,
      };
      return query;
    },
  };
  return {
    transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(tx),
  } as never;
}

function makeProductionCandidate(
  overrides: Partial<LegacyBookingReportReminderCandidate> = {},
): LegacyBookingReportReminderCandidate {
  const scheduledStartAt = new Date("2026-10-20T02:00:00.000Z");
  const scheduledEndAt = new Date("2026-10-20T03:00:00.000Z");
  return {
    bookingId: "booking-1",
    bookingType: "solo",
    tutorId: "tutor-1",
    sessionId: null,
    scheduledStartAt,
    scheduledEndAt,
    scheduledStartAtEpoch: epochSeconds(scheduledStartAt),
    scheduledEndAtEpoch: epochSeconds(scheduledEndAt),
    reminderPeriod: 0,
    cursorScheduledEndAt: scheduledEndAt,
    ...overrides,
  };
}

describe("legacy booking missing-report reminders", () => {
  test.each([-1, 0.5])(
    "skips invalid reminder period %s before attempting a write",
    async (reminderPeriod) => {
      const candidate = makeProductionCandidate({ reminderPeriod });
      let writeAttempts = 0;
      const repo: BookingReportReminderRepo = {
        findDue: async () => [candidate],
        writeIfPending: async () => {
          writeAttempts += 1;
          return true;
        },
      };
      const processor = makeProcessor(
        repo,
        { write: async () => undefined },
        () => new Date("2026-10-21T03:00:00.000Z"),
      );

      await expect(processor.processPendingReportReminders()).resolves.toEqual({
        checked: 1,
        queued: 0,
        skipped: 1,
        failed: 0,
      });
      expect(writeAttempts).toBe(0);
    },
  );

  test("writeIfPending rejects a series candidate without a session id", async () => {
    const candidate = makeProductionCandidate({
      bookingType: "series",
      sessionId: null,
    });
    const bookingRow = {
      id: candidate.bookingId,
      type: candidate.bookingType,
      tutorId: candidate.tutorId,
      currentState: "scheduled",
      completedAt: null,
      scheduledStartAtEpoch: candidate.scheduledStartAtEpoch,
      scheduledEndAtEpoch: candidate.scheduledEndAtEpoch,
      reminderPeriod: candidate.reminderPeriod,
    };
    const repo = createBookingReportReminderRepo();

    await expect(
      repo.writeIfPending(
        makeTransactionDb([[bookingRow]]),
        candidate,
        new Date("2026-10-21T03:00:00.000Z"),
        bookingReportReminderEventKey(
          candidate.bookingId,
          candidate.sessionId,
          candidate.reminderPeriod,
        ),
        async () => {
          throw new Error("The missing session must not be written");
        },
      ),
    ).resolves.toBe(false);
  });

  test("writeIfPending rejects a single booking candidate with a session id", async () => {
    const candidate = makeProductionCandidate({
      sessionId: "unexpected-session",
    });
    const bookingRow = {
      id: candidate.bookingId,
      type: candidate.bookingType,
      tutorId: candidate.tutorId,
      currentState: "scheduled",
      completedAt: null,
      scheduledStartAtEpoch: candidate.scheduledStartAtEpoch,
      scheduledEndAtEpoch: candidate.scheduledEndAtEpoch,
      reminderPeriod: candidate.reminderPeriod,
    };
    const repo = createBookingReportReminderRepo();

    await expect(
      repo.writeIfPending(
        makeTransactionDb([[bookingRow]]),
        candidate,
        new Date("2026-10-21T03:00:00.000Z"),
        bookingReportReminderEventKey(
          candidate.bookingId,
          candidate.sessionId,
          candidate.reminderPeriod,
        ),
        async () => {
          throw new Error("A mismatched session must not be written");
        },
      ),
    ).resolves.toBe(false);
  });

  test.each([
    ["missing", []],
    [
      "cancelled",
      [
        {
          id: "session-1",
          currentState: "cancelled",
          completedAt: null,
          scheduledStartAtEpoch: epochSeconds(
            new Date("2026-10-20T02:00:00.000Z"),
          ),
          scheduledEndAtEpoch: epochSeconds(
            new Date("2026-10-20T03:00:00.000Z"),
          ),
          reminderPeriod: 0,
        },
      ],
    ],
    [
      "completed",
      [
        {
          id: "session-1",
          currentState: "scheduled",
          completedAt: new Date("2026-10-21T02:00:00.000Z"),
          scheduledStartAtEpoch: epochSeconds(
            new Date("2026-10-20T02:00:00.000Z"),
          ),
          scheduledEndAtEpoch: epochSeconds(
            new Date("2026-10-20T03:00:00.000Z"),
          ),
          reminderPeriod: 0,
        },
      ],
    ],
  ] as const)(
    "writeIfPending rejects a %s series session",
    async (_, sessionRows) => {
      const candidate = makeProductionCandidate({
        bookingType: "series",
        sessionId: "session-1",
      });
      const bookingRow = {
        id: candidate.bookingId,
        type: candidate.bookingType,
        tutorId: candidate.tutorId,
        currentState: "scheduled",
        completedAt: null,
        scheduledStartAtEpoch: candidate.scheduledStartAtEpoch,
        scheduledEndAtEpoch: candidate.scheduledEndAtEpoch,
        reminderPeriod: candidate.reminderPeriod,
      };
      const repo = createBookingReportReminderRepo();

      await expect(
        repo.writeIfPending(
          makeTransactionDb([[bookingRow], [...sessionRows]]),
          candidate,
          new Date("2026-10-21T03:00:00.000Z"),
          bookingReportReminderEventKey(
            candidate.bookingId,
            candidate.sessionId,
            candidate.reminderPeriod,
          ),
          async () => {
            throw new Error("An invalid session must not be written");
          },
        ),
      ).resolves.toBe(false);
    },
  );

  test("writeIfPending allows one valid series reminder and skips an existing report", async () => {
    const candidate = makeProductionCandidate({
      bookingType: "series",
      sessionId: "session-1",
    });
    const bookingRow = {
      id: candidate.bookingId,
      type: candidate.bookingType,
      tutorId: candidate.tutorId,
      currentState: "scheduled",
      completedAt: null,
      scheduledStartAtEpoch: candidate.scheduledStartAtEpoch,
      scheduledEndAtEpoch: candidate.scheduledEndAtEpoch,
      reminderPeriod: candidate.reminderPeriod,
    };
    const sessionRow = {
      id: candidate.sessionId,
      currentState: "scheduled",
      completedAt: null,
      scheduledStartAtEpoch: candidate.scheduledStartAtEpoch,
      scheduledEndAtEpoch: candidate.scheduledEndAtEpoch,
      reminderPeriod: candidate.reminderPeriod,
    };
    const repo = createBookingReportReminderRepo();
    let writeCount = 0;
    const eventKey = bookingReportReminderEventKey(
      candidate.bookingId,
      candidate.sessionId,
      candidate.reminderPeriod,
    );

    await expect(
      repo.writeIfPending(
        makeTransactionDb([[bookingRow], [sessionRow], [], []]),
        candidate,
        new Date("2026-10-21T03:00:00.000Z"),
        eventKey,
        async () => {
          writeCount += 1;
        },
      ),
    ).resolves.toBe(true);
    await expect(
      repo.writeIfPending(
        makeTransactionDb([[bookingRow], [sessionRow], [{ id: "report-1" }]]),
        candidate,
        new Date("2026-10-21T03:00:00.000Z"),
        eventKey,
        async () => {
          writeCount += 1;
        },
      ),
    ).resolves.toBe(false);
    expect(writeCount).toBe(1);
  });

  test("starts at session end and repeats on 24-hour elapsed boundaries", () => {
    const endAt = new Date("2026-10-21T03:00:00.000Z");
    expect(datePeriodForTest(endAt, new Date(endAt.getTime() - 1))).toBe(null);
    expect(datePeriodForTest(endAt, endAt)).toBe(0);
    expect(
      datePeriodForTest(endAt, new Date(endAt.getTime() + DAY_MS - 1)),
    ).toBe(0);
    expect(datePeriodForTest(endAt, new Date(endAt.getTime() + DAY_MS))).toBe(
      1,
    );
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

  test("rotates past a failed batch, reaches later sessions, then wraps for retries", async () => {
    const nowAt = new Date("2026-10-21T03:00:00.000Z");
    const bookings = Array.from({ length: 101 }, (_, index) =>
      makeBooking(
        `booking-${String(index).padStart(3, "0")}`,
        "solo",
        nowAt,
        `tutor-${index}`,
      ),
    );
    const fake = makeRepo(bookings);
    const writes: NotificationWriteParams[] = [];
    let failOldestBatch = true;
    const processor = makeProcessor(
      fake.repo,
      {
        async write(params) {
          writes.push(params);
          if (failOldestBatch && params.bookingId !== "booking-100") {
            throw new Error("injected persistent outbox failure");
          }
        },
      },
      () => nowAt,
    );

    expect(await processor.processPendingReportReminders()).toMatchObject({
      checked: 100,
      queued: 0,
      failed: 100,
    });
    expect(await processor.processPendingReportReminders()).toMatchObject({
      checked: 1,
      queued: 1,
      failed: 0,
    });
    expect(writes.at(-1)?.bookingId).toBe("booking-100");

    failOldestBatch = false;
    expect(await processor.processPendingReportReminders()).toMatchObject({
      checked: 100,
      queued: 100,
      failed: 0,
    });
    expect(new Set(writes.map(({ eventKey }) => eventKey)).size).toBe(101);
    expect(
      writes.filter(({ bookingId }) => bookingId === "booking-100"),
    ).toHaveLength(1);
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
    expect(
      notificationEmailHtml({
        body: "Review the ended booking before reporting.",
        metadata: {
          action: "booking-session-report",
          actionUrl: "not a valid URL",
        },
      }),
    ).toBe("Review the ended booking before reporting.");
    expect(
      notificationEmailHtml({
        body: "Review the ended booking before reporting.",
        metadata: {
          action: "unsupported-action",
          actionUrl: "https://cogito.example/bookings/b1",
        },
      }),
    ).toBe("Review the ended booking before reporting.");
  });
});

test("reminder processor uses the real clock when no custom clock is supplied", async () => {
  const times: Date[] = [];
  const processor = createBookingReportReminderProcessor({
    db: {} as DbType,
    appBaseUrl: "https://cogito.example",
    notification: { write: async () => undefined },
    repo: {
      findDue: async (_db, nowAt) => {
        times.push(nowAt);
        return [];
      },
      writeIfPending: async () => false,
    },
  });
  const before = Date.now();
  await expect(processor.processPendingReportReminders()).resolves.toEqual({
    checked: 0,
    queued: 0,
    skipped: 0,
    failed: 0,
  });
  expect(times).toHaveLength(1);
  expect(times[0]!.getTime()).toBeGreaterThanOrEqual(before);
  expect(times[0]!.getTime()).toBeLessThanOrEqual(Date.now());
});

test("series cursor orders equal-time siblings by their session ids", async () => {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const database = drizzle(async (sql, params) => {
    queries.push({ sql, params });
    return { rows: [] };
  });
  const candidate = makeProductionCandidate({
    bookingType: "series",
    sessionId: "session-2",
  });
  await createBookingReportReminderRepo().findDue(
    database as unknown as DbType,
    new Date("2026-10-21T03:00:00Z"),
    100,
    candidate,
  );
  const seriesQuery = queries.find(({ sql }) =>
    sql.includes('inner join "booking_session"'),
  )!;
  expect(seriesQuery.params).toContain("session-2");
  expect(seriesQuery.sql).toContain('"booking_session"."id" >');
});

test.each(["solo", "series"] as const)(
  "future %s timestamps decode a null period and prevent a stale reminder",
  async (type) => {
    const candidate = makeProductionCandidate({
      bookingType: type,
      sessionId: type === "series" ? "session1" : null,
    });
    let writes = 0;
    const database = drizzle(async (sql) => ({
      rows: sql.includes('from "booking_session"')
        ? [
            [
              "session1",
              "scheduled",
              null,
              candidate.scheduledStartAtEpoch,
              candidate.scheduledEndAtEpoch,
              null,
            ],
          ]
        : [
            [
              candidate.bookingId,
              type,
              candidate.tutorId,
              "scheduled",
              null,
              candidate.scheduledStartAtEpoch,
              candidate.scheduledEndAtEpoch,
              null,
            ],
          ],
    }));
    const db = {
      transaction: async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(database),
    } as unknown as DbType;
    await expect(
      createBookingReportReminderRepo().writeIfPending(
        db,
        candidate,
        new Date("2026-10-21T03:00:00Z"),
        "stale-reminder",
        async () => {
          writes++;
        },
      ),
    ).resolves.toBe(false);
    expect(writes).toBe(0);
  },
);

test("candidate ordering is deterministic for equal timestamps, ids, and series siblings", async () => {
  const end = "2026-10-20 03:00:00+00";
  const raw = (id: string, type: string, sessionId: string | null) => [
    id,
    type,
    "tutor1",
    sessionId,
    "2026-10-20 02:00:00+00",
    end,
    "1792461600",
    "1792465200",
    "0",
    end,
  ];
  // Repeated equal candidates exercise comparator reflexivity, while series siblings exercise its final ordering key.
  const single = raw("booking-a", "solo", null);
  const database = drizzle(async (sql) => ({
    rows: sql.includes('inner join "booking_session"')
      ? [
          raw("booking-b", "series", "session-2"),
          raw("booking-b", "series", "session-1"),
        ]
      : [single, [...single], raw("booking-z", "solo", null)],
  }));
  const rows = await createBookingReportReminderRepo().findDue(
    database as unknown as DbType,
    new Date("2026-10-21T03:00:00Z"),
    100,
  );
  expect(
    rows.map(({ bookingId, sessionId }) => [bookingId, sessionId]),
  ).toEqual([
    ["booking-a", null],
    ["booking-a", null],
    ["booking-b", "session-1"],
    ["booking-b", "session-2"],
    ["booking-z", null],
  ]);
});
