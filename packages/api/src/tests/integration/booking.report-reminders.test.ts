import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@cogito-app/db";
import {
  booking as bookingTable,
  bookingParticipant,
  ledgerEntry,
  notification,
  notificationDispatch,
  sessionCompletionFeedback,
  tutorSessionFee,
  user,
} from "@cogito-app/db/schema";
import { services } from "../../services";
import {
  bookingReportReminderEventKey,
  bookingReportReminderPeriod,
  createBookingReportReminderProcessor,
  createBookingReportReminderRepo,
  type BookingReportReminderRepo,
  type LegacyBookingReportReminderCandidate,
} from "../../modules/booking/booking.report-reminders";

const DAY_MS = 24 * 60 * 60 * 1000;
const fixtureEndAt = new Date("1900-01-01T01:00:00.000Z");
const feedback = {
  discussion: ["Reviewed the learner's approach"],
  strengths: ["Explained the first step clearly"],
  improvements: ["Practise a second example"],
};

function assertReminderTestDatabase() {
  let url: URL;
  try {
    url = new URL(process.env.DATABASE_URL ?? "");
  } catch {
    throw new Error(
      "Booking reminder integration tests require loopback 6769/cogito-test.",
    );
  }
  if (
    process.env.NODE_ENV !== "test" ||
    process.env.TEST_DATABASE_ALLOW_RESET !== undefined ||
    process.env.TEST_DATABASE_RESET_TARGET !== undefined ||
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "::1", "[::1]"].includes(
      url.hostname.toLowerCase(),
    ) ||
    url.port !== "6769" ||
    url.pathname !== "/cogito-test" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error(
      "Booking reminder integration tests require NODE_ENV=test, exact loopback 6769/cogito-test, and absent reset overrides; no data was changed.",
    );
  }
}

assertReminderTestDatabase();

const ownedBookingIds = new Set<string>();
const ownedUserIds = new Set<string>();
const repo = createBookingReportReminderRepo();
const fixtureCandidates = new Map<
  string,
  LegacyBookingReportReminderCandidate
>();
function compareCandidates(
  left: LegacyBookingReportReminderCandidate,
  right: LegacyBookingReportReminderCandidate,
) {
  return (
    left.scheduledEndAt.getTime() - right.scheduledEndAt.getTime() ||
    left.bookingId.localeCompare(right.bookingId) ||
    (left.sessionId ?? "").localeCompare(right.sessionId ?? "")
  );
}
const processorRepo: BookingReportReminderRepo = {
  async findDue(_database, nowAt, limit, after) {
    return [...fixtureCandidates.values()]
      .filter((candidate) => candidate.scheduledEndAt <= nowAt)
      .toSorted(compareCandidates)
      .filter((candidate) => !after || compareCandidates(candidate, after) > 0)
      .slice(0, limit);
  },
  writeIfPending(database, candidate, nowAt, eventKey, write) {
    return repo.writeIfPending(database, candidate, nowAt, eventKey, write);
  },
};

async function createUser(role: "tutor" | "student") {
  const id = crypto.randomUUID();
  const email = `${role}.booking-reminder.${id}@cogito.test`;
  await db.insert(user).values({
    id,
    name: `Booking reminder ${role}`,
    email,
    emailVerified: true,
    role,
  });
  ownedUserIds.add(id);
  return { id, email };
}

async function createScheduledBooking(tutorId: string, studentId: string) {
  const id = crypto.randomUUID();
  const scheduledStartAt = new Date(fixtureEndAt.getTime() - 60 * 60_000);
  await db.insert(bookingTable).values({
    id,
    type: "solo",
    modality: "online",
    tutorId,
    proposerId: studentId,
    targetGroupSize: 1,
    minConfirmedHeadcount: 1,
    confirmedHeadcount: 1,
    currentState: "scheduled",
    scheduledStartAt,
    scheduledEndAt: fixtureEndAt,
    deadlineAt: new Date(Date.now() + 60_000),
    timezone: "Asia/Jakarta",
    priceSnapshot: {
      perStudent: 0,
      baseline: 0,
      tutorShare: 0,
      cogitoTake: 0,
      baselineCogitoTake: 0,
      baselineTutorShare: 0,
      extraTotal: 0,
      cogitoExtraTake: 0,
      tutorExtraShare: 0,
    },
    originalMarks: 0,
    holdAmount: 0,
  });
  ownedBookingIds.add(id);
  await db.insert(bookingParticipant).values({
    bookingId: id,
    userId: studentId,
    role: "proposer",
    confirmationState: "confirmed",
    heldAmount: 0,
    confirmedAt: new Date(),
  });
  return { id, scheduledStartAt, scheduledEndAt: fixtureEndAt };
}

function candidateFor(
  bookingId: string,
  tutorId: string,
  scheduledStartAt: Date,
  scheduledEndAt: Date,
): LegacyBookingReportReminderCandidate {
  return {
    bookingId,
    bookingType: "solo",
    tutorId,
    sessionId: null,
    scheduledStartAt,
    scheduledEndAt,
  };
}

async function writeIfPending(
  candidate: LegacyBookingReportReminderCandidate,
  nowAt: Date,
) {
  const period = bookingReportReminderPeriod(candidate.scheduledEndAt, nowAt);
  if (period === null) throw new Error("Expected an ended reminder candidate");
  const eventKey = bookingReportReminderEventKey(
    candidate.bookingId,
    candidate.sessionId,
    period,
  );
  let notificationWriteCalled = false;
  const queued = await repo.writeIfPending(
    db,
    candidate,
    nowAt,
    eventKey,
    async (tx) => {
      notificationWriteCalled = true;
      await services.notification.write({
        db: tx,
        userId: candidate.tutorId,
        bookingId: candidate.bookingId,
        category: "schedule",
        title: "Session report reminder",
        body: "This ended session has no report on record. Review its outcome, and submit a report only if it was delivered.",
        severity: "action",
        emailRequired: true,
        eventKey,
        metadata: { action: "booking-session-report" },
      });
    },
  );
  return { queued, notificationWriteCalled, eventKey };
}

async function reminderRecords(eventKey: string) {
  const notifications = await db
    .select()
    .from(notification)
    .where(eq(notification.eventKey, eventKey));
  const dispatches = notifications.length
    ? await db
        .select()
        .from(notificationDispatch)
        .where(
          inArray(
            notificationDispatch.notificationId,
            notifications.map((row) => row.id),
          ),
        )
    : [];
  return { notifications, dispatches };
}

async function financialRows(bookingId: string) {
  const [ledger, fees] = await Promise.all([
    db.select().from(ledgerEntry).where(eq(ledgerEntry.bookingId, bookingId)),
    db
      .select()
      .from(tutorSessionFee)
      .where(eq(tutorSessionFee.bookingId, bookingId)),
  ]);
  return { ledger, fees };
}

describe("legacy booking report reminders PostgreSQL invariants", () => {
  let tutorId = "";
  let tutorEmail = "";
  let studentId = "";

  beforeAll(async () => {
    assertReminderTestDatabase();
    const result = await db.execute(
      sql`SELECT current_database() AS database_name`,
    );
    const rows = (
      Array.isArray(result)
        ? result
        : ((result as unknown as { rows?: unknown[] }).rows ?? [])
    ) as Array<{ database_name?: unknown }>;
    if (rows[0]?.database_name !== "cogito-test") {
      throw new Error(
        "Booking reminder integration tests require current_database() = cogito-test; no data was changed.",
      );
    }

    const tutor = await createUser("tutor");
    const student = await createUser("student");
    tutorId = tutor.id;
    tutorEmail = tutor.email;
    studentId = student.id;
  });

  afterAll(async () => {
    const bookingIds = [...ownedBookingIds];
    if (bookingIds.length > 0) {
      await db.delete(bookingTable).where(inArray(bookingTable.id, bookingIds));
    }
    const userIds = [...ownedUserIds];
    if (userIds.length > 0) {
      await db.delete(user).where(inArray(user.id, userIds));
    }
  });

  test("rechecks reports and state under lock, and deduplicates the tutor email outbox", async () => {
    const active = await createScheduledBooking(tutorId, studentId);
    const reportArrives = await createScheduledBooking(tutorId, studentId);
    const cancelled = await createScheduledBooking(tutorId, studentId);
    const rescheduled = await createScheduledBooking(tutorId, studentId);
    let nowAt = new Date("2026-10-23T03:00:00.000Z");
    for (const fixture of [active, reportArrives, cancelled, rescheduled]) {
      fixtureCandidates.set(
        fixture.id,
        candidateFor(
          fixture.id,
          tutorId,
          fixture.scheduledStartAt,
          fixture.scheduledEndAt,
        ),
      );
    }

    const staleCandidates = [reportArrives, cancelled, rescheduled].map(
      (fixture) => fixtureCandidates.get(fixture.id)!,
    );
    await db.transaction(async (tx) => {
      await tx
        .update(bookingTable)
        .set({ currentState: "completed", completedAt: nowAt })
        .where(eq(bookingTable.id, reportArrives.id));
      await tx.insert(sessionCompletionFeedback).values({
        bookingId: reportArrives.id,
        sessionId: null,
        authorId: tutorId,
        ...feedback,
      });
    });
    await db
      .update(bookingTable)
      .set({ currentState: "cancelled" })
      .where(eq(bookingTable.id, cancelled.id));
    await db
      .update(bookingTable)
      .set({
        scheduledStartAt: new Date(nowAt.getTime() + 60_000),
        scheduledEndAt: new Date(nowAt.getTime() + 120_000),
      })
      .where(eq(bookingTable.id, rescheduled.id));

    const rejected = await Promise.all(
      staleCandidates.map((candidate) => writeIfPending(candidate, nowAt)),
    );
    expect(
      rejected.every(
        (result) => !result.queued && !result.notificationWriteCalled,
      ),
    ).toBe(true);

    const beforeReminder = await financialRows(active.id);
    const firstProcessor = createBookingReportReminderProcessor({
      db,
      repo: processorRepo,
      notification: services.notification,
      appBaseUrl: "https://cogito.example",
      clock: () => nowAt,
    });
    const duplicateProcessor = createBookingReportReminderProcessor({
      db,
      repo: processorRepo,
      notification: services.notification,
      appBaseUrl: "https://cogito.example",
      clock: () => nowAt,
    });
    await Promise.all([
      firstProcessor.processPendingReportReminders(),
      duplicateProcessor.processPendingReportReminders(),
    ]);

    const period = bookingReportReminderPeriod(active.scheduledEndAt, nowAt)!;
    const eventKey = bookingReportReminderEventKey(active.id, null, period);
    const records = await reminderRecords(eventKey);
    expect(records.notifications).toHaveLength(1);
    expect(records.notifications[0]).toMatchObject({
      userId: tutorId,
      bookingId: active.id,
      category: "schedule",
      severity: "action",
      eventKey,
      metadata: {
        action: "booking-session-report",
        actionUrl: `https://cogito.example/bookings/${active.id}`,
      },
    });
    expect(records.dispatches).toHaveLength(1);
    expect(records.dispatches[0]).toMatchObject({
      notificationId: records.notifications[0]?.id,
      channel: "email",
      recipientEmail: tutorEmail,
      status: "queued",
    });
    const [activeState] = await db
      .select({ currentState: bookingTable.currentState })
      .from(bookingTable)
      .where(eq(bookingTable.id, active.id));
    expect(activeState?.currentState).toBe("scheduled");
    expect(await financialRows(active.id)).toEqual(beforeReminder);

    await db.transaction(async (tx) => {
      await tx
        .update(bookingTable)
        .set({ currentState: "completed", completedAt: nowAt })
        .where(eq(bookingTable.id, active.id));
      await tx.insert(sessionCompletionFeedback).values({
        bookingId: active.id,
        sessionId: null,
        authorId: tutorId,
        ...feedback,
      });
    });
    nowAt = new Date(nowAt.getTime() + DAY_MS);
    await createBookingReportReminderProcessor({
      db,
      repo: processorRepo,
      notification: services.notification,
      appBaseUrl: "https://cogito.example",
      clock: () => nowAt,
    }).processPendingReportReminders();

    const nextPeriod = bookingReportReminderPeriod(
      active.scheduledEndAt,
      nowAt,
    )!;
    expect(
      await reminderRecords(
        bookingReportReminderEventKey(active.id, null, nextPeriod),
      ),
    ).toMatchObject({ notifications: [], dispatches: [] });
    for (const stale of rejected) {
      // eslint-disable-next-line no-await-in-loop -- Assert each owned stale identity.
      expect(await reminderRecords(stale.eventKey)).toMatchObject({
        notifications: [],
        dispatches: [],
      });
    }
  });
});
