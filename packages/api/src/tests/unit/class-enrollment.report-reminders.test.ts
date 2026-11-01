import { describe, expect, test } from "bun:test";
import type { DbType } from "../../lib/db";
import type { TxClient } from "../../lib/tx";
import type {
  NotificationService,
  NotificationWriteParams,
} from "../../modules/notification/notification.service";
import {
  classReportReminderEventKey,
  classReportReminderPeriod,
  createClassReportReminderProcessor,
  createClassReportReminderRepo,
  type ClassReportReminderCandidate,
  type ClassReportReminderRepo,
} from "../../modules/class-enrollment/class-enrollment.report-reminders";
import { notificationEmailHtml } from "../../modules/notification/notification.service";

const DAY_MS = 24 * 60 * 60 * 1000;

type FakeSession = ClassReportReminderCandidate & {
  classState: "published" | "postponed" | "cancelled" | "completed";
  sessionState: "scheduled" | "completed" | "cancelled";
  reportSubmitted: boolean;
};

function makeSession(
  id: string,
  endAt: Date,
  tutorId = `tutor-${id}`,
): FakeSession {
  return {
    id,
    classId: `class-${id}`,
    tutorId,
    endAt,
    classState: "published",
    sessionState: "scheduled",
    reportSubmitted: false,
  };
}

function makeRepo(rows: FakeSession[]) {
  const recordedKeys = new Set<string>();
  let afterFind: (() => void) | undefined;
  const repo: ClassReportReminderRepo = {
    async findDue(_db, nowAt, limit) {
      const candidates = rows
        .filter((row) => {
          const period = classReportReminderPeriod(row.endAt, nowAt);
          return (
            (row.classState === "published" ||
              row.classState === "postponed" ||
              row.classState === "cancelled") &&
            row.sessionState === "scheduled" &&
            !row.reportSubmitted &&
            period !== null &&
            !recordedKeys.has(classReportReminderEventKey(row.id, period))
          );
        })
        .toSorted((left, right) => left.endAt.getTime() - right.endAt.getTime())
        .slice(0, limit)
        .map(({ id, classId, tutorId, endAt }) => ({
          id,
          classId,
          tutorId,
          endAt,
        }));
      afterFind?.();
      afterFind = undefined;
      return candidates;
    },
    async writeIfPending(_db, candidate, nowAt, eventKey, write) {
      const row = rows.find(
        (item) =>
          item.id === candidate.id && item.classId === candidate.classId,
      );
      const period = row ? classReportReminderPeriod(row.endAt, nowAt) : null;
      if (
        !row ||
        (row.classState !== "published" &&
          row.classState !== "postponed" &&
          row.classState !== "cancelled") ||
        row.sessionState !== "scheduled" ||
        row.reportSubmitted ||
        row.tutorId !== candidate.tutorId ||
        row.endAt.getTime() !== candidate.endAt.getTime() ||
        period === null ||
        classReportReminderEventKey(row.id, period) !== eventKey ||
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

function makeNotification(
  write: (params: NotificationWriteParams) => Promise<void>,
): Pick<NotificationService, "write"> {
  return { write };
}

function makeProcessor(
  repo: ClassReportReminderRepo,
  notification: Pick<NotificationService, "write">,
  clock: () => Date,
) {
  return createClassReportReminderProcessor({
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

describe("academy class missing-report reminders", () => {
  test("processor uses the system clock when no clock is injected", async () => {
    const processor = createClassReportReminderProcessor({
      db: {} as DbType,
      repo: {
        findDue: async () => [],
        writeIfPending: async () => false,
      },
      notification: makeNotification(async () => undefined),
      appBaseUrl: "https://cogito.example",
    });

    await expect(processor.processPendingReportReminders()).resolves.toEqual({
      checked: 0,
      queued: 0,
      skipped: 0,
      failed: 0,
    });
  });

  test("processor skips candidates whose reminder period is not due yet", async () => {
    const nowAt = new Date("2026-10-21T03:00:00.000Z");
    const futureCandidate = makeSession(
      "future",
      new Date(nowAt.getTime() + 1),
    );
    let writeAttempts = 0;
    const processor = makeProcessor(
      {
        findDue: async () => [futureCandidate],
        writeIfPending: async () => {
          writeAttempts += 1;
          return true;
        },
      },
      makeNotification(async () => undefined),
      () => nowAt,
    );

    await expect(processor.processPendingReportReminders()).resolves.toEqual({
      checked: 1,
      queued: 0,
      skipped: 1,
      failed: 0,
    });
    expect(writeAttempts).toBe(0);
  });

  test("writeIfPending skips a session that disappeared before locking", async () => {
    const nowAt = new Date("2026-10-21T03:00:00.000Z");
    const candidate = makeSession("disappeared", nowAt);
    let writeCalled = false;
    const repo = createClassReportReminderRepo();

    await expect(
      repo.writeIfPending(
        makeTransactionDb([[{ state: "published" }], []]),
        candidate,
        nowAt,
        classReportReminderEventKey(candidate.id, 0),
        async () => {
          writeCalled = true;
        },
      ),
    ).resolves.toBe(false);
    expect(writeCalled).toBe(false);
  });

  test("writeIfPending skips a session after a report was inserted", async () => {
    const nowAt = new Date("2026-10-21T03:00:00.000Z");
    const candidate = makeSession("reported", nowAt);
    let writeCalled = false;
    const repo = createClassReportReminderRepo();

    await expect(
      repo.writeIfPending(
        makeTransactionDb([
          [{ state: "published" }],
          [
            {
              id: candidate.id,
              state: "scheduled",
              tutorId: candidate.tutorId,
              endAt: candidate.endAt,
            },
          ],
          [{ id: "report-1" }],
        ]),
        candidate,
        nowAt,
        classReportReminderEventKey(candidate.id, 0),
        async () => {
          writeCalled = true;
        },
      ),
    ).resolves.toBe(false);
    expect(writeCalled).toBe(false);
  });

  test("starts at session end and repeats on 24-hour elapsed boundaries", () => {
    const endAt = new Date("2026-10-21T03:00:00.000Z");
    expect(
      classReportReminderPeriod(endAt, new Date(endAt.getTime() - 1)),
    ).toBe(null);
    expect(classReportReminderPeriod(endAt, endAt)).toBe(0);
    expect(
      classReportReminderPeriod(endAt, new Date(endAt.getTime() + DAY_MS - 1)),
    ).toBe(0);
    expect(
      classReportReminderPeriod(endAt, new Date(endAt.getTime() + DAY_MS)),
    ).toBe(1);
    expect(classReportReminderEventKey("session-1", 1)).toBe(
      "academy-class-session:session-1:missing-report:day:1",
    );
  });

  test("replay and worker restart do not repeat the current period", async () => {
    const nowAt = new Date("2026-10-21T03:00:00.000Z");
    const fake = makeRepo([makeSession("s1", nowAt)]);
    const writes: NotificationWriteParams[] = [];
    const notification = makeNotification(async (params) => {
      writes.push(params);
    });

    expect(
      await makeProcessor(
        fake.repo,
        notification,
        () => nowAt,
      ).processPendingReportReminders(),
    ).toMatchObject({ queued: 1, failed: 0 });
    // A fresh processor models a scheduler process restart against the same
    // durable notification event-key store.
    expect(
      await makeProcessor(
        fake.repo,
        notification,
        () => nowAt,
      ).processPendingReportReminders(),
    ).toMatchObject({ checked: 0, queued: 0 });
    expect(writes).toHaveLength(1);
  });

  test("catch-up emits only the currently due period, then resumes daily", async () => {
    const endAt = new Date("2026-10-01T00:00:00.000Z");
    let nowAt = new Date(endAt.getTime() + 5 * DAY_MS);
    const fake = makeRepo([makeSession("s1", endAt)]);
    const writes: NotificationWriteParams[] = [];
    const notification = makeNotification(async (params) => {
      writes.push(params);
    });
    const processor = makeProcessor(fake.repo, notification, () => nowAt);

    expect(await processor.processPendingReportReminders()).toMatchObject({
      queued: 1,
      failed: 0,
    });
    expect(fake.recordedKeys).toEqual(
      new Set([classReportReminderEventKey("s1", 5)]),
    );
    expect(await processor.processPendingReportReminders()).toMatchObject({
      checked: 0,
    });

    nowAt = new Date(nowAt.getTime() + DAY_MS);
    expect(await processor.processPendingReportReminders()).toMatchObject({
      queued: 1,
    });
    expect(writes).toHaveLength(2);
  });

  test("retains pending delivery after parent cancellation and rechecks locked state", async () => {
    const nowAt = new Date("2026-10-21T03:00:00.000Z");
    const cancelled = makeSession("cancelled", nowAt);
    const classCancelled = makeSession("class-cancelled", nowAt);
    const reported = makeSession("reported", nowAt);
    const rescheduled = makeSession("rescheduled", nowAt);
    const reassigned = makeSession("reassigned", nowAt);
    const completedClass = makeSession("completed-class", nowAt);
    completedClass.classState = "completed";
    const completedSession = makeSession("completed-session", nowAt);
    const fake = makeRepo([
      cancelled,
      classCancelled,
      reported,
      rescheduled,
      reassigned,
      completedClass,
      completedSession,
    ]);
    fake.beforeWriteIfPending(() => {
      cancelled.sessionState = "cancelled";
      reported.reportSubmitted = true;
      rescheduled.endAt = new Date(nowAt.getTime() - 60_000);
      reassigned.tutorId = "new-tutor";
      completedSession.sessionState = "completed";
    });
    let writes = 0;
    const processor = makeProcessor(
      fake.repo,
      makeNotification(async () => {
        writes += 1;
      }),
      () => nowAt,
    );

    expect(await processor.processPendingReportReminders()).toMatchObject({
      checked: 6,
      queued: 1,
      skipped: 5,
    });
    expect(writes).toBe(1);
    expect(fake.recordedKeys).toContain(
      classReportReminderEventKey("class-cancelled", 0),
    );
  });

  test("caps each scheduler pass at 100 sessions", async () => {
    const nowAt = new Date("2026-10-21T03:00:00.000Z");
    const fake = makeRepo(
      Array.from({ length: 101 }, (_, index) =>
        makeSession(`s${index}`, nowAt),
      ),
    );
    let writes = 0;
    const processor = makeProcessor(
      fake.repo,
      makeNotification(async () => {
        writes += 1;
      }),
      () => nowAt,
    );

    expect(await processor.processPendingReportReminders()).toMatchObject({
      checked: 100,
      queued: 100,
    });
    expect(writes).toBe(100);
  });

  test("a failed notification is retried while other candidates continue", async () => {
    const nowAt = new Date("2026-10-21T03:00:00.000Z");
    const fake = makeRepo([
      makeSession("s1", new Date(nowAt.getTime() - 1_000), "tutor-1"),
      makeSession("s2", new Date(nowAt.getTime() - 500), "tutor-2"),
    ]);
    let failFirst = true;
    const writes: NotificationWriteParams[] = [];
    const notification = makeNotification(async (params) => {
      writes.push(params);
      if (params.userId === "tutor-1" && failFirst) {
        failFirst = false;
        throw new Error("outbox write failed");
      }
    });
    const processor = makeProcessor(fake.repo, notification, () => nowAt);

    expect(await processor.processPendingReportReminders()).toMatchObject({
      queued: 1,
      failed: 1,
    });
    expect(await processor.processPendingReportReminders()).toMatchObject({
      queued: 1,
      failed: 0,
    });
    expect(writes.map(({ userId }) => userId)).toEqual([
      "tutor-1",
      "tutor-2",
      "tutor-1",
    ]);
    expect(writes[0]).toMatchObject({
      category: "schedule",
      severity: "action",
      emailRequired: true,
      metadata: {
        action: "class-session-report",
        actionUrl: "https://cogito.example/class-reports",
      },
    });
    expect(writes[0]?.body).not.toContain("s1");
  });

  test("email action links are escaped and reject non-web URLs", () => {
    expect(
      notificationEmailHtml({
        body: "Submit the missing class report.",
        metadata: {
          action: "class-session-report",
          actionUrl: "https://cogito.example/class-reports?from=mail&next=1",
        },
      }),
    ).toContain(
      '<a href="https://cogito.example/class-reports?from=mail&amp;next=1">',
    );
    expect(
      notificationEmailHtml({
        body: "Submit the missing class report.",
        metadata: {
          action: "class-session-report",
          actionUrl: "javascript:alert(1)",
        },
      }),
    ).toBe("Submit the missing class report.");
  });
});
