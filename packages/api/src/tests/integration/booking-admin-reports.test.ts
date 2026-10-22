import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@cogito-app/db";
import {
  booking as bookingTable,
  bookingParticipant,
  bookingSession,
  ledgerEntry,
  notification as notificationTable,
  sessionCompletionFeedback,
  sessionCompletionFeedbackHistory,
  tutorSessionFee,
  user,
  wallet,
} from "@cogito-app/db/schema";
import { services } from "../../services";
import { escapeHtml } from "../../lib/sanitize";
import { BookingCompletionReportConflictError } from "../../modules/booking/booking.errors";
import {
  createTestClient,
  createTestContext,
  setUserRole,
  signUpAndSignIn,
} from "../helpers/test-client";

function assertOnDemandReportTestDatabase() {
  let url: URL;
  try {
    url = new URL(process.env.DATABASE_URL ?? "");
  } catch {
    throw new Error(
      "On-demand booking report integration tests require loopback 6769/cogito-test.",
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
      "On-demand booking report integration tests require NODE_ENV=test, exact loopback 6769/cogito-test, and absent reset overrides; no data was changed.",
    );
  }
}

assertOnDemandReportTestDatabase();

const ownedBookingIds = new Set<string>();
const ownedUserIds = new Set<string>();
const now = () => new Date(Date.now() - 3 * 60_000);
const feeSnapshot = {
  perStudent: 50,
  baseline: 50,
  tutorShare: 40,
  cogitoTake: 10,
  baselineCogitoTake: 10,
  baselineTutorShare: 40,
  extraTotal: 0,
  cogitoExtraTake: 0,
  tutorExtraShare: 0,
};
const firstFeedback = {
  discussion: ["Reviewed the learner's approach"],
  strengths: ["Explained the first step clearly"],
  improvements: ["Practise a second example"],
};

type Role = "admin" | "tutor" | "student";

async function createAuthUser(role: Role) {
  const suffix = crypto.randomUUID();
  const email = `${role}.booking-report.${suffix}@cogito.test`;
  const registered = await signUpAndSignIn(
    email,
    "Test1234!",
    `Report ${role}`,
  );
  const context = await createTestContext(registered.cookie);
  const id = context.session!.user.id;
  ownedUserIds.add(id);
  if (role !== "student") {
    await setUserRole(id, role);
  }
  return {
    id,
    client: createTestClient(await createTestContext(registered.cookie)),
  };
}

async function createBareStudent() {
  const id = crypto.randomUUID();
  await db.insert(user).values({
    id,
    name: "Synthetic report participant",
    email: `report-participant.${id}@cogito.test`,
    role: "student",
    emailVerified: true,
  });
  ownedUserIds.add(id);
  return id;
}

async function createWallet(userId: string, heldAmount: number) {
  const [row] = await db
    .insert(wallet)
    .values({
      userId,
      totalBalance: heldAmount,
      heldBalance: heldAmount,
      availableBalance: 0,
    })
    .returning();
  return row!;
}

async function addParticipant(
  bookingId: string,
  userId: string,
  values: {
    role: "proposer" | "invitee";
    confirmationState: "confirmed" | "pending" | "withdrawn_pre_h2" | "no_show";
    heldAmount?: number;
  },
) {
  await db.insert(bookingParticipant).values({
    bookingId,
    userId,
    role: values.role,
    confirmationState: values.confirmationState,
    heldAmount: values.heldAmount ?? 0,
    confirmedAt: values.confirmationState === "confirmed" ? new Date() : null,
  });
}

async function createScheduledBooking(
  tutorId: string,
  proposerId: string,
  type: "solo" | "group" | "series",
  participants: Array<{
    userId: string;
    role: "proposer" | "invitee";
    heldAmount: number;
  }>,
) {
  const id = crypto.randomUUID();
  const endsAt = now();
  const startsAt = new Date(endsAt.getTime() - 60_000);
  const totalHeld = participants.reduce((sum, row) => sum + row.heldAmount, 0);
  const [row] = await db
    .insert(bookingTable)
    .values({
      id,
      type,
      modality: "online",
      tutorId,
      proposerId,
      targetGroupSize: type === "group" ? participants.length : 1,
      minConfirmedHeadcount: type === "group" ? 2 : 1,
      confirmedHeadcount: participants.length,
      currentState: "scheduled",
      scheduledStartAt: startsAt,
      scheduledEndAt: endsAt,
      deadlineAt: new Date(Date.now() + 60_000),
      timezone: "Asia/Jakarta",
      priceSnapshot: feeSnapshot,
      originalMarks: totalHeld,
      holdAmount: totalHeld,
    })
    .returning();
  ownedBookingIds.add(id);

  await Promise.all(
    participants.map(async (participant) => {
      if (participant.heldAmount > 0) {
        await createWallet(participant.userId, participant.heldAmount);
      }
      await addParticipant(id, participant.userId, {
        role: participant.role,
        confirmationState: "confirmed",
        heldAmount: participant.heldAmount,
      });
    }),
  );

  let sessionId: string | undefined;
  if (type === "series") {
    sessionId = crypto.randomUUID();
    await db.insert(bookingSession).values([
      {
        id: sessionId,
        seriesBookingId: id,
        scheduledStartAt: startsAt,
        scheduledEndAt: endsAt,
        currentState: "scheduled",
        holdAmount: totalHeld / 2,
        priceSnapshot: feeSnapshot,
      },
      {
        id: crypto.randomUUID(),
        seriesBookingId: id,
        scheduledStartAt: new Date(startsAt.getTime() + 24 * 60 * 60_000),
        scheduledEndAt: new Date(endsAt.getTime() + 24 * 60 * 60_000),
        currentState: "scheduled",
        holdAmount: totalHeld / 2,
        priceSnapshot: feeSnapshot,
      },
    ]);
  }
  return { booking: row!, sessionId };
}

async function insertReport(
  bookingId: string,
  tutorId: string,
  sessionId: string | null = null,
) {
  return db
    .insert(sessionCompletionFeedback)
    .values({
      bookingId,
      sessionId,
      authorId: tutorId,
      discussion: ["Already submitted by the assigned tutor"],
      strengths: ["Paid seat"],
      improvements: ["Continue practising"],
      version: 1,
    })
    .returning();
}

async function insertDeduction(
  bookingId: string,
  userId: string,
  eventKey: string,
) {
  const [walletRow] = await db
    .select()
    .from(wallet)
    .where(eq(wallet.userId, userId));
  if (!walletRow) throw new Error("Expected a wallet for the report fixture");
  await db.insert(ledgerEntry).values({
    walletId: walletRow.id,
    bookingId,
    eventKey,
    entryType: "deduct",
    actorType: "tutor",
    amount: 1,
    beforeBalance: 10,
    afterBalance: 9,
    balanceAfterWalletTotal: 9,
    balanceAfterWalletHeld: 0,
    reason: "Synthetic chargeable report entitlement",
    sourceReference: bookingId,
  });
}

async function financialSnapshot(bookingId: string) {
  const [ledger, fees, reports, history] = await Promise.all([
    db.select().from(ledgerEntry).where(eq(ledgerEntry.bookingId, bookingId)),
    db
      .select()
      .from(tutorSessionFee)
      .where(eq(tutorSessionFee.bookingId, bookingId)),
    db
      .select()
      .from(sessionCompletionFeedback)
      .where(eq(sessionCompletionFeedback.bookingId, bookingId)),
    db
      .select()
      .from(sessionCompletionFeedbackHistory)
      .where(eq(sessionCompletionFeedbackHistory.bookingId, bookingId)),
  ]);
  return { ledger, fees, reports, history };
}

describe("on-demand booking report admin coverage (non-reset UUID fixtures)", () => {
  let adminId = "";
  let tutorId = "";
  let adminClient: ReturnType<typeof createTestClient>;
  let tutorClient: ReturnType<typeof createTestClient>;
  let studentId = "";

  beforeAll(async () => {
    assertOnDemandReportTestDatabase();
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
        "On-demand booking report integration tests require current_database() = cogito-test; no data was changed.",
      );
    }

    const admin = await createAuthUser("admin");
    const tutor = await createAuthUser("tutor");
    const student = await createAuthUser("student");
    adminId = admin.id;
    tutorId = tutor.id;
    studentId = student.id;
    adminClient = admin.client;
    tutorClient = tutor.client;
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

  test("solo, group, and series initial reports settle once under the assigned tutor", async () => {
    const groupStudent = await createBareStudent();
    const fixtures = [
      await createScheduledBooking(tutorId, studentId, "solo", [
        { userId: studentId, role: "proposer", heldAmount: 50 },
      ]),
      await createScheduledBooking(tutorId, studentId, "group", [
        { userId: studentId, role: "proposer", heldAmount: 25 },
        { userId: groupStudent, role: "invitee", heldAmount: 25 },
      ]),
      await createScheduledBooking(tutorId, studentId, "series", [
        { userId: studentId, role: "proposer", heldAmount: 100 },
      ]),
    ];

    // Keep submissions sequential: every fixture uses the same tutor payout lock.
    for (const [index, fixture] of fixtures.entries()) {
      const requestKey = crypto.randomUUID();
      // eslint-disable-next-line no-await-in-loop
      const result = await adminClient.booking.submitAdminCompletionReport({
        bookingId: fixture.booking.id,
        ...(fixture.sessionId ? { sessionId: fixture.sessionId } : {}),
        feedback: firstFeedback,
        deliveryConfirmed: true,
        reason: `Admin report scenario ${index + 1}`,
        requestKey,
      });
      expect(result).toMatchObject({
        bookingId: fixture.booking.id,
        version: 1,
        status: "submitted",
        actorId: adminId,
        actorRole: "admin",
        deliveryConfirmed: true,
      });

      // eslint-disable-next-line no-await-in-loop
      const snapshot = await financialSnapshot(fixture.booking.id);
      expect(snapshot.reports).toHaveLength(1);
      expect(snapshot.history).toHaveLength(1);
      expect(snapshot.fees).toHaveLength(1);
      expect(snapshot.fees[0]?.tutorId).toBe(tutorId);
      expect(
        snapshot.ledger.filter((entry) => entry.entryType === "deduct").length,
      ).toBe(fixture.booking.type === "group" ? 2 : 1);
      // eslint-disable-next-line no-await-in-loop
      const deductionOwners = await db
        .select({ userId: wallet.userId })
        .from(ledgerEntry)
        .innerJoin(wallet, eq(wallet.id, ledgerEntry.walletId))
        .where(
          and(
            eq(ledgerEntry.bookingId, fixture.booking.id),
            eq(ledgerEntry.entryType, "deduct"),
          ),
        );
      const expectedFunders =
        fixture.booking.type === "group"
          ? [studentId, groupStudent]
          : [studentId];
      expect(deductionOwners.map((row) => row.userId).toSorted()).toEqual(
        expectedFunders.toSorted(),
      );
      if (fixture.sessionId) {
        expect(snapshot.history[0]?.sessionId).toBe(fixture.sessionId);
        // eslint-disable-next-line no-await-in-loop
        const [session] = await db
          .select()
          .from(bookingSession)
          .where(eq(bookingSession.id, fixture.sessionId));
        expect(session?.currentState).toBe("completed");
        // eslint-disable-next-line no-await-in-loop
        const tutorNotices = await db
          .select()
          .from(notificationTable)
          .where(
            and(
              eq(notificationTable.bookingId, fixture.booking.id),
              eq(
                notificationTable.eventKey,
                `booking.${fixture.booking.id}.session.${fixture.sessionId}.report.1.admin`,
              ),
            ),
          );
        expect(tutorNotices).toHaveLength(1);
      }
    }
  });

  test("stable retries return the saved result; correction changes only report history", async () => {
    const fixture = await createScheduledBooking(tutorId, studentId, "solo", [
      { userId: studentId, role: "proposer", heldAmount: 50 },
    ]);
    const requestKey = crypto.randomUUID();
    const input = {
      bookingId: fixture.booking.id,
      feedback: firstFeedback,
      deliveryConfirmed: true as const,
      reason: "Record the delivered session",
      requestKey,
    };
    const first = await adminClient.booking.submitAdminCompletionReport(input);
    const retry = await adminClient.booking.submitAdminCompletionReport(input);
    expect(retry.id).toBe(first.id);

    await expect(
      adminClient.booking.submitAdminCompletionReport({
        ...input,
        feedback: {
          ...firstFeedback,
          improvements: ["Changed payload"],
        },
      }),
    ).rejects.toThrow();

    const beforeCorrection = await financialSnapshot(fixture.booking.id);
    const correctionInput = {
      ...input,
      feedback: {
        ...firstFeedback,
        improvements: ["Add one worked example"],
      },
      reason: "Correct the exercise detail",
      expectedVersion: 1,
      requestKey: crypto.randomUUID(),
    };
    const correction =
      await adminClient.booking.submitAdminCompletionReport(correctionInput);
    const correctionRetry =
      await adminClient.booking.submitAdminCompletionReport(correctionInput);
    expect(correction).toMatchObject({ version: 2, status: "corrected" });
    expect(correctionRetry.id).toBe(correction.id);
    await expect(
      adminClient.booking.submitAdminCompletionReport({
        ...input,
        feedback: firstFeedback,
        reason: "Stale correction attempt",
        expectedVersion: 1,
        requestKey: crypto.randomUUID(),
      }),
    ).rejects.toThrow();

    const afterCorrection = await financialSnapshot(fixture.booking.id);
    expect(afterCorrection.ledger).toEqual(beforeCorrection.ledger);
    expect(afterCorrection.fees).toEqual(beforeCorrection.fees);
    expect(afterCorrection.reports[0]?.version).toBe(2);
    expect(afterCorrection.history.map((row) => row.status)).toEqual([
      "submitted",
      "corrected",
    ]);
    expect(afterCorrection.history.map((row) => row.actorId)).toEqual([
      adminId,
      adminId,
    ]);
    const tutorNotices = await db
      .select()
      .from(notificationTable)
      .where(
        and(
          eq(notificationTable.bookingId, fixture.booking.id),
          inArray(notificationTable.eventKey, [
            `booking.${fixture.booking.id}.session.solo.report.1.admin`,
            `booking.${fixture.booking.id}.session.solo.report.2.admin`,
          ]),
        ),
      );
    expect(tutorNotices).toHaveLength(2);
  });

  test("adds reports to completed legacy solo, group, and series sessions without settling again", async () => {
    const groupStudent = await createBareStudent();
    const fixtures = [
      await createScheduledBooking(tutorId, studentId, "solo", [
        { userId: studentId, role: "proposer", heldAmount: 0 },
      ]),
      await createScheduledBooking(tutorId, studentId, "group", [
        { userId: studentId, role: "proposer", heldAmount: 0 },
        { userId: groupStudent, role: "invitee", heldAmount: 0 },
      ]),
      await createScheduledBooking(tutorId, studentId, "series", [
        { userId: studentId, role: "proposer", heldAmount: 0 },
      ]),
    ];

    // Every fixture uses the same tutor payout lock; preserve deterministic order.
    // eslint-disable no-await-in-loop
    for (const fixture of fixtures) {
      if (fixture.booking.type === "series" && fixture.sessionId) {
        await db
          .update(bookingSession)
          .set({ currentState: "completed", completedAt: new Date() })
          .where(eq(bookingSession.id, fixture.sessionId));
      } else {
        await db
          .update(bookingTable)
          .set({ currentState: "completed", completedAt: new Date() })
          .where(eq(bookingTable.id, fixture.booking.id));
      }
      const before = await financialSnapshot(fixture.booking.id);
      const result = await adminClient.booking.submitAdminCompletionReport({
        bookingId: fixture.booking.id,
        ...(fixture.sessionId ? { sessionId: fixture.sessionId } : {}),
        feedback: firstFeedback,
        deliveryConfirmed: true,
        reason: "Record a missing legacy report",
        requestKey: crypto.randomUUID(),
      });
      const after = await financialSnapshot(fixture.booking.id);

      expect(result).toMatchObject({
        bookingId: fixture.booking.id,
        status: "submitted",
        actorId: adminId,
        actorRole: "admin",
      });
      expect(after.ledger).toEqual(before.ledger);
      expect(after.fees).toEqual(before.fees);
      expect(after.reports).toHaveLength(1);
      expect(after.history).toHaveLength(1);
    }
    // eslint-enable no-await-in-loop
  });

  test("canonical feedback survives repeated unchanged corrections and 600-codepoint fields", async () => {
    const fixture = await createScheduledBooking(tutorId, studentId, "solo", [
      { userId: studentId, role: "proposer", heldAmount: 50 },
    ]);
    const feedback = {
      discussion: [
        "A & B",
        "C < D > E",
        "'single' \"double\"",
        "literal &amp;",
      ],
      strengths: ["&amp; < > \" '"],
      improvements: ["&<>\"'".repeat(120)],
    };
    const initial = await adminClient.booking.submitAdminCompletionReport({
      bookingId: fixture.booking.id,
      feedback,
      deliveryConfirmed: true,
      reason: "Record exact text",
      requestKey: crypto.randomUUID(),
    });
    expect(initial.version).toBe(1);
    const afterInitial = await services.booking.listCompletionFeedback(
      fixture.booking.id,
      adminId,
      "admin",
    );
    expect(afterInitial[0]).toMatchObject(feedback);
    const beforeCorrections = await financialSnapshot(fixture.booking.id);

    const correction = {
      bookingId: fixture.booking.id,
      feedback,
      deliveryConfirmed: true as const,
      reason: "Confirm the wording",
      expectedVersion: 1,
      requestKey: crypto.randomUUID(),
    };
    expect(
      await adminClient.booking.submitAdminCompletionReport(correction),
    ).toMatchObject({ version: 2, status: "corrected" });
    const repeated = {
      ...correction,
      reason: "Confirm the same wording again",
      expectedVersion: 2,
      requestKey: crypto.randomUUID(),
    };
    expect(
      await adminClient.booking.submitAdminCompletionReport(repeated),
    ).toMatchObject({ version: 3, status: "corrected" });

    const current = await services.booking.listCompletionFeedback(
      fixture.booking.id,
      adminId,
      "admin",
    );
    const history = await services.booking.listCompletionFeedbackHistory(
      fixture.booking.id,
      adminId,
      "admin",
    );
    expect(current[0]).toMatchObject({ ...feedback, version: 3 });
    expect(history.map((entry) => entry.status)).toEqual([
      "submitted",
      "corrected",
      "corrected",
    ]);
    for (const entry of history) expect(entry).toMatchObject(feedback);
    const afterCorrections = await financialSnapshot(fixture.booking.id);
    expect(afterCorrections.ledger).toEqual(beforeCorrections.ledger);
    expect(afterCorrections.fees).toEqual(beforeCorrections.fees);
  });

  test("correcting a legacy report preserves its identity, content snapshot, and creation time", async () => {
    const fixture = await createScheduledBooking(tutorId, studentId, "solo", [
      { userId: studentId, role: "proposer", heldAmount: 0 },
    ]);
    const legacyCreatedAt = new Date("2024-06-15T10:30:00.000Z");
    const legacyDiscussion = `Legacy ${"text &amp; <tag> 'quoted' \"double\" ".repeat(35)}`;
    const legacyStrength = "Legacy &amp; strength <with quotes>";
    const legacyImprovement = "Older suggestion: 'keep' \"trying\"";
    await db
      .update(bookingTable)
      .set({ currentState: "completed", completedAt: legacyCreatedAt })
      .where(eq(bookingTable.id, fixture.booking.id));
    const [legacyReport] = await db
      .insert(sessionCompletionFeedback)
      .values({
        bookingId: fixture.booking.id,
        sessionId: null,
        authorId: tutorId,
        discussion: [escapeHtml(legacyDiscussion)],
        strengths: [escapeHtml(legacyStrength)],
        improvements: [escapeHtml(legacyImprovement)],
        createdAt: legacyCreatedAt,
      })
      .returning();

    const legacyRead = await services.booking.listCompletionFeedback(
      fixture.booking.id,
      adminId,
      "admin",
    );
    expect(legacyRead[0]).toMatchObject({
      discussion: [legacyDiscussion],
      strengths: [legacyStrength],
      improvements: [legacyImprovement],
    });
    expect(legacyDiscussion.length).toBeGreaterThan(600);
    const beforeCorrection = await financialSnapshot(fixture.booking.id);

    await adminClient.booking.submitAdminCompletionReport({
      bookingId: fixture.booking.id,
      feedback: {
        ...firstFeedback,
        improvements: ["Updated future practice"],
      },
      deliveryConfirmed: true,
      reason: "Clarify the historical feedback",
      expectedVersion: 1,
      requestKey: crypto.randomUUID(),
    });

    const [updated] = await db
      .select()
      .from(sessionCompletionFeedback)
      .where(eq(sessionCompletionFeedback.bookingId, fixture.booking.id));
    const history = await db
      .select()
      .from(sessionCompletionFeedbackHistory)
      .where(eq(sessionCompletionFeedbackHistory.bookingId, fixture.booking.id))
      .orderBy(sessionCompletionFeedbackHistory.version);
    expect(updated).toMatchObject({
      id: legacyReport!.id,
      authorId: tutorId,
      version: 2,
      createdAt: legacyCreatedAt,
    });
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({
      version: 1,
      status: "legacy_snapshot",
      actorId: null,
      actorRole: "legacy",
      discussion: [escapeHtml(legacyDiscussion)],
      createdAt: legacyCreatedAt,
    });
    expect(history[1]).toMatchObject({
      version: 2,
      status: "corrected",
      actorId: adminId,
      actorRole: "admin",
    });
    const historyRead = await services.booking.listCompletionFeedbackHistory(
      fixture.booking.id,
      adminId,
      "admin",
    );
    expect(historyRead[0]?.discussion).toEqual([legacyDiscussion]);
    expect(historyRead[1]).toMatchObject({
      discussion: firstFeedback.discussion,
      strengths: firstFeedback.strengths,
      improvements: ["Updated future practice"],
    });
    const afterCorrection = await financialSnapshot(fixture.booking.id);
    expect(afterCorrection.ledger).toEqual(beforeCorrection.ledger);
    expect(afterCorrection.fees).toEqual(beforeCorrection.fees);
  });

  test("concurrent tutor and admin initial submit create one financial effect", async () => {
    const fixture = await createScheduledBooking(tutorId, studentId, "solo", [
      { userId: studentId, role: "proposer", heldAmount: 50 },
    ]);
    const results = await Promise.allSettled([
      adminClient.booking.submitAdminCompletionReport({
        bookingId: fixture.booking.id,
        feedback: firstFeedback,
        deliveryConfirmed: true,
        reason: "Record on behalf of the assigned tutor",
        requestKey: crypto.randomUUID(),
      }),
      tutorClient.tutorActions.completeSession({
        bookingId: fixture.booking.id,
        feedback: firstFeedback,
        requestKey: crypto.randomUUID(),
      }),
    ]);
    expect(results.some((result) => result.status === "fulfilled")).toBe(true);
    const snapshot = await financialSnapshot(fixture.booking.id);
    expect(snapshot.fees).toHaveLength(1);
    expect(
      snapshot.ledger.filter((entry) => entry.entryType === "deduct"),
    ).toHaveLength(1);
    expect(snapshot.reports).toHaveLength(1);
    expect(snapshot.history).toHaveLength(1);
    expect(snapshot.fees[0]?.tutorId).toBe(tutorId);
  });

  test("one request key racing across admin/tutor bookings and tutors settles only its winner", async () => {
    const secondTutor = await createAuthUser("tutor");
    const secondStudent = await createBareStudent();
    const fixtures = [
      await createScheduledBooking(tutorId, studentId, "solo", [
        { userId: studentId, role: "proposer", heldAmount: 50 },
      ]),
      await createScheduledBooking(secondTutor.id, secondStudent, "solo", [
        { userId: secondStudent, role: "proposer", heldAmount: 50 },
      ]),
    ];
    const before = await Promise.all(
      fixtures.map((fixture) => financialSnapshot(fixture.booking.id)),
    );
    const requestKey = crypto.randomUUID();
    const results = await Promise.allSettled([
      services.booking.submitAdminCompletionReport({
        bookingId: fixtures[0]!.booking.id,
        adminId,
        feedback: firstFeedback,
        deliveryConfirmed: true,
        reason: "Use one idempotency key",
        requestKey,
      }),
      services.booking.completeSession(
        fixtures[1]!.booking.id,
        secondTutor.id,
        undefined,
        firstFeedback,
        requestKey.toUpperCase(),
      ),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const rejection = results.find((result) => result.status === "rejected");
    expect(
      rejection?.status === "rejected" ? rejection.reason : null,
    ).toBeInstanceOf(BookingCompletionReportConflictError);
    const after = await Promise.all(
      fixtures.map((fixture) => financialSnapshot(fixture.booking.id)),
    );
    const keyedEvents = await db
      .select()
      .from(sessionCompletionFeedbackHistory)
      .where(eq(sessionCompletionFeedbackHistory.requestKey, requestKey));
    expect(keyedEvents).toHaveLength(1);
    const winningIndex = fixtures.findIndex(
      (fixture) => fixture.booking.id === keyedEvents[0]?.bookingId,
    );
    const losingIndex = 1 - winningIndex;
    expect(after[winningIndex]?.reports).toHaveLength(1);
    expect(after[winningIndex]?.history).toHaveLength(1);
    expect(after[winningIndex]?.fees).toHaveLength(1);
    expect(after[winningIndex]?.fees[0]?.tutorId).toBe(
      fixtures[winningIndex]?.booking.tutorId,
    );
    expect(
      after[winningIndex]?.ledger.filter(
        (entry) => entry.entryType === "deduct",
      ),
    ).toHaveLength(1);
    expect(after[losingIndex]?.reports).toEqual(before[losingIndex]?.reports);
    expect(after[losingIndex]?.history).toEqual(before[losingIndex]?.history);
    expect(after[losingIndex]?.fees).toEqual(before[losingIndex]?.fees);
    expect(after[losingIndex]?.ledger).toEqual(before[losingIndex]?.ledger);
    const loserBooking = await db
      .select({ currentState: bookingTable.currentState })
      .from(bookingTable)
      .where(eq(bookingTable.id, fixtures[losingIndex]!.booking.id));
    expect(loserBooking[0]?.currentState).toBe("scheduled");
  });

  test("admin route rejects other roles and malformed delivery before writes", async () => {
    const fixture = await createScheduledBooking(tutorId, studentId, "solo", [
      { userId: studentId, role: "proposer", heldAmount: 50 },
    ]);
    const before = await financialSnapshot(fixture.booking.id);
    const validInput = {
      bookingId: fixture.booking.id,
      feedback: firstFeedback,
      deliveryConfirmed: true as const,
      reason: "Confirm the delivered session",
      requestKey: crypto.randomUUID(),
    };
    await expect(
      tutorClient.booking.submitAdminCompletionReport(validInput),
    ).rejects.toThrow();
    await expect(
      adminClient.booking.submitAdminCompletionReport({
        ...validInput,
        deliveryConfirmed: false,
      } as never),
    ).rejects.toThrow();
    await expect(
      adminClient.booking.submitAdminCompletionReport({
        ...validInput,
        feedback: { ...firstFeedback, discussion: [] },
      } as never),
    ).rejects.toThrow();
    await expect(
      adminClient.booking.submitAdminCompletionReport({
        ...validInput,
        reason: "   ",
      }),
    ).rejects.toThrow();
    const after = await financialSnapshot(fixture.booking.id);
    expect(after).toEqual(before);
  });

  test("Q06 read access requires a charged session seat, including no-show charges", async () => {
    const paidId = await createBareStudent();
    const noShowId = await createBareStudent();
    const pendingId = await createBareStudent();
    const withdrawnId = await createBareStudent();
    const unfundedId = await createBareStudent();
    const bookingId = crypto.randomUUID();
    ownedBookingIds.add(bookingId);
    const [group] = await db
      .insert(bookingTable)
      .values({
        id: bookingId,
        type: "group",
        modality: "online",
        tutorId,
        proposerId: paidId,
        targetGroupSize: 5,
        minConfirmedHeadcount: 2,
        confirmedHeadcount: 3,
        currentState: "completed",
        scheduledStartAt: now(),
        scheduledEndAt: new Date(now().getTime() + 60_000),
        timezone: "Asia/Jakarta",
        priceSnapshot: feeSnapshot,
        originalMarks: 50,
      })
      .returning();
    expect(group?.id).toBe(bookingId);
    await db.insert(bookingParticipant).values(
      (
        [
          [paidId, "confirmed", "proposer"],
          [noShowId, "no_show", "invitee"],
          [pendingId, "pending", "invitee"],
          [withdrawnId, "withdrawn_pre_h2", "invitee"],
          [unfundedId, "confirmed", "invitee"],
        ] as const
      ).map(([userId, confirmationState, role]) => ({
        bookingId,
        userId,
        role,
        confirmationState,
        heldAmount: 0,
      })),
    );
    await createWallet(paidId, 10);
    await createWallet(noShowId, 10);
    await insertDeduction(
      bookingId,
      paidId,
      `booking.${bookingId}.complete.${paidId}`,
    );
    await insertDeduction(
      bookingId,
      noShowId,
      `booking.${bookingId}.no_show.${noShowId}.solo`,
    );
    await insertReport(bookingId, tutorId);

    expect(
      await services.booking.listCompletionFeedback(
        bookingId,
        paidId,
        "student",
      ),
    ).toHaveLength(1);
    expect(
      await services.booking.listCompletionFeedback(
        bookingId,
        noShowId,
        "student",
      ),
    ).toHaveLength(1);
    const deniedReports = await Promise.all(
      [pendingId, withdrawnId, unfundedId].map((userId) =>
        services.booking.listCompletionFeedback(bookingId, userId, "student"),
      ),
    );
    for (const reports of deniedReports) expect(reports).toHaveLength(0);
  });

  test("group-series report reads require that student's session deduction", async () => {
    const paidId = await createBareStudent();
    const noShowId = await createBareStudent();
    const unpaidId = await createBareStudent();
    const bookingId = crypto.randomUUID();
    const sessionId = crypto.randomUUID();
    const cancelledSiblingId = crypto.randomUUID();
    ownedBookingIds.add(bookingId);
    await db.insert(bookingTable).values({
      id: bookingId,
      type: "series",
      modality: "online",
      tutorId,
      proposerId: paidId,
      targetGroupSize: 2,
      minConfirmedHeadcount: 2,
      confirmedHeadcount: 2,
      currentState: "completed",
      scheduledStartAt: now(),
      scheduledEndAt: new Date(now().getTime() + 60_000),
      timezone: "Asia/Jakarta",
      priceSnapshot: feeSnapshot,
      originalMarks: 100,
    });
    await addParticipant(bookingId, paidId, {
      role: "proposer",
      confirmationState: "confirmed",
    });
    await addParticipant(bookingId, unpaidId, {
      role: "invitee",
      confirmationState: "confirmed",
    });
    await addParticipant(bookingId, noShowId, {
      role: "invitee",
      confirmationState: "no_show",
    });
    await db.insert(bookingSession).values([
      {
        id: sessionId,
        seriesBookingId: bookingId,
        scheduledStartAt: now(),
        scheduledEndAt: new Date(now().getTime() + 60_000),
        currentState: "completed",
        holdAmount: 0,
        priceSnapshot: feeSnapshot,
      },
      {
        id: cancelledSiblingId,
        seriesBookingId: bookingId,
        scheduledStartAt: new Date(now().getTime() + 24 * 60 * 60_000),
        scheduledEndAt: new Date(now().getTime() + 24 * 60 * 60_000 + 60_000),
        currentState: "cancelled",
        holdAmount: 0,
        priceSnapshot: feeSnapshot,
      },
    ]);
    await createWallet(paidId, 10);
    await createWallet(noShowId, 10);
    await insertDeduction(
      bookingId,
      paidId,
      `booking.${bookingId}.session.${sessionId}.deduct.${paidId}`,
    );
    await insertDeduction(
      bookingId,
      noShowId,
      `booking.${bookingId}.no_show.${noShowId}.${sessionId}`,
    );
    await insertReport(bookingId, tutorId, sessionId);

    expect(
      await services.booking.listCompletionFeedback(
        bookingId,
        paidId,
        "student",
      ),
    ).toHaveLength(1);
    expect(
      await services.booking.listCompletionFeedback(
        bookingId,
        noShowId,
        "student",
      ),
    ).toHaveLength(1);
    expect(
      await services.booking.listCompletionFeedback(
        bookingId,
        unpaidId,
        "student",
      ),
    ).toHaveLength(0);
  });

  test("a delivered series child stays readable after its parent is cancelled", async () => {
    const readerId = await createBareStudent();
    const bookingId = crypto.randomUUID();
    const sessionId = crypto.randomUUID();
    const cancelledSiblingId = crypto.randomUUID();
    ownedBookingIds.add(bookingId);
    await db.insert(bookingTable).values({
      id: bookingId,
      type: "series",
      modality: "online",
      tutorId,
      proposerId: readerId,
      targetGroupSize: 1,
      minConfirmedHeadcount: 1,
      confirmedHeadcount: 1,
      currentState: "cancelled",
      scheduledStartAt: now(),
      scheduledEndAt: new Date(now().getTime() + 60_000),
      timezone: "Asia/Jakarta",
      priceSnapshot: feeSnapshot,
      originalMarks: 50,
    });
    await addParticipant(bookingId, readerId, {
      role: "proposer",
      confirmationState: "confirmed",
    });
    await db.insert(bookingSession).values([
      {
        id: sessionId,
        seriesBookingId: bookingId,
        scheduledStartAt: now(),
        scheduledEndAt: new Date(now().getTime() + 60_000),
        currentState: "completed",
        holdAmount: 0,
        priceSnapshot: feeSnapshot,
      },
      {
        id: cancelledSiblingId,
        seriesBookingId: bookingId,
        scheduledStartAt: new Date(now().getTime() + 24 * 60 * 60_000),
        scheduledEndAt: new Date(now().getTime() + 24 * 60 * 60_000 + 60_000),
        currentState: "cancelled",
        holdAmount: 0,
        priceSnapshot: feeSnapshot,
      },
    ]);
    await createWallet(readerId, 10);
    await insertDeduction(
      bookingId,
      readerId,
      `booking.${bookingId}.session.${sessionId}.deduct`,
    );
    await insertReport(bookingId, tutorId, sessionId);

    const reports = await services.booking.listCompletionFeedback(
      bookingId,
      readerId,
      "student",
    );
    expect(reports).toHaveLength(1);
    expect(reports[0]?.sessionId).toBe(sessionId);
  });
});
