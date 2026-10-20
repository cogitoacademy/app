import { describe, test, expect, beforeAll } from "bun:test";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@cogito-app/db";
import {
  availabilitySlot,
  booking as bookingTable,
  bookingParticipant,
  bookingSession,
  ledgerEntry,
  sessionCompletionFeedback,
  tutorInvite,
  tutorProfile,
  tutorSessionFee,
  wallet,
  type BookingPriceSnapshot,
} from "@cogito-app/db/schema";
import { buildTutorSessionFeeRecord } from "../../modules/booking/tutor-session-fee";
import { TEST_COMPLETION_FEEDBACK } from "../helpers/completion-feedback";
import {
  createTestContext,
  createTestClient,
  signUpAndSignIn,
  setUserRole,
  resetDatabase,
  type TestClient,
} from "../helpers/test-client";

async function creditWallet(userId: string, amount: number) {
  const { services } = await import("@cogito-app/api/services");
  const w = await services.wallet.getOrCreate(userId);
  await db
    .update(wallet)
    .set({ totalBalance: amount, availableBalance: amount })
    .where(eq(wallet.id, w.id));
}

async function signInAndGetCookie(email: string, password: string) {
  const { auth } = await import("@cogito-app/auth");
  const res = await auth.api.signInEmail({
    body: { email, password },
    headers: new Headers(),
    asResponse: true,
  });
  const setCookie = res.headers.getSetCookie();
  return setCookie
    .find((c: string) => c.includes("better-auth.session_token"))
    ?.split(";")[0];
}

async function createPublishedTutor(email: string, ts: number) {
  await signUpAndSignIn(email, "Test1234!", "Tutor H2");
  const tutorCtx = await createTestContext(
    (await signInAndGetCookie(email, "Test1234!")) ?? "",
  );
  if (!tutorCtx.session?.user) throw new Error("Tutor session missing");
  const tutorId = tutorCtx.session.user.id;
  await setUserRole(tutorId, "tutor");

  const [invite] = await db
    .insert(tutorInvite)
    .values({
      email,
      displayName: "Prof H2",
      token: `token-h2-${ts}`,
      status: "accepted",
      invitedBy: tutorId,
      expiresAt: new Date(Date.now() + 86400000),
      acceptedBy: tutorId,
      acceptedAt: new Date(),
    })
    .returning();

  await db.insert(tutorProfile).values({
    userId: tutorId,
    inviteId: invite!.id,
    shortBio: "Bio",
    modality: "both",
    prices: { "1": 50, "2": 45, "3": 40, "4": 35, "5": 30, "6": 28 },
    onboardingStatus: "published",
    publishedAt: new Date(),
  });

  const start = new Date(Date.now() + 24 * 3600_000);
  const [slot] = await db
    .insert(availabilitySlot)
    .values({
      tutorId,
      startDate: start,
      endDate: new Date(start.getTime() + 240 * 3600_000),
      modality: "both",
    })
    .returning();

  return { tutorId, slotId: slot!.id };
}

async function getParticipant(bookingId: string, userId: string) {
  const [participant] = await db
    .select()
    .from(bookingParticipant)
    .where(
      and(
        eq(bookingParticipant.bookingId, bookingId),
        eq(bookingParticipant.userId, userId),
      ),
    );
  if (!participant) throw new Error("Expected booking participant");
  return participant;
}

async function getWallet(userId: string) {
  const [result] = await db
    .select()
    .from(wallet)
    .where(eq(wallet.userId, userId));
  if (!result) throw new Error("Expected wallet");
  return result;
}

async function backdateSession(sessionId: string) {
  await db
    .update(bookingSession)
    .set({
      scheduledStartAt: new Date(Date.now() - 2 * 3600_000),
      scheduledEndAt: new Date(Date.now() - 1 * 3600_000),
    })
    .where(eq(bookingSession.id, sessionId));
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function waitForBlockedQuery(fragment: string) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    // eslint-disable-next-line no-await-in-loop -- wait for the database lock gate
    const result = await db.execute(sql`
      SELECT query
      FROM pg_stat_activity
      WHERE datname = current_database()
        AND pid <> pg_backend_pid()
        AND wait_event_type = 'Lock'
    `);
    const rows = (
      Array.isArray(result)
        ? result
        : ((result as unknown as { rows?: unknown[] }).rows ?? [])
    ) as Array<{ query: string }>;
    if (
      rows.some((row) =>
        row.query.toLowerCase().includes(fragment.toLowerCase()),
      )
    ) {
      return;
    }
    // eslint-disable-next-line no-await-in-loop -- bounded condition polling
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(
    `Timed out waiting for a blocked query containing ${fragment}`,
  );
}

async function holdBookingRescheduleLock(bookingId: string) {
  const acquired = deferred();
  const release = deferred();
  const transaction = db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${bookingId}, 1))`,
    );
    acquired.resolve();
    await release.promise;
  });
  await acquired.promise;
  return { transaction, release: release.resolve };
}

describe("series no-show and completion settlement", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  const ts = Date.now();
  let studentClient: TestClient;
  let inviteeClient: TestClient;
  let tutorClient: TestClient;
  let studentId: string;
  let inviteeId: string;
  let tutorId: string;
  let slotId: string;

  beforeAll(async () => {
    const studentRes = await signUpAndSignIn(
      `student.h2.${ts}@cogito.test`,
      "Test1234!",
      "Student H2",
    );
    studentClient = createTestClient(
      await createTestContext(studentRes.cookie),
    );
    const studentCtx = await createTestContext(studentRes.cookie);
    if (!studentCtx.session?.user) throw new Error("Student session missing");
    studentId = studentCtx.session.user.id;
    await creditWallet(studentId, 10_000);

    const inviteeRes = await signUpAndSignIn(
      `invitee.h2.${ts}@cogito.test`,
      "Test1234!",
      "Invitee H2",
    );
    inviteeClient = createTestClient(
      await createTestContext(inviteeRes.cookie),
    );
    const inviteeCtx = await createTestContext(inviteeRes.cookie);
    if (!inviteeCtx.session?.user) throw new Error("Invitee session missing");
    inviteeId = inviteeCtx.session.user.id;
    await creditWallet(inviteeId, 10_000);

    const tutor = await createPublishedTutor(`tutor.h2.${ts}@cogito.test`, ts);
    tutorId = tutor.tutorId;
    slotId = tutor.slotId;
    tutorClient = createTestClient(
      await createTestContext(
        (await signInAndGetCookie(`tutor.h2.${ts}@cogito.test`, "Test1234!")) ??
          "",
      ),
    );
  });

  async function createSoloSeries(startHour: number) {
    const base = Date.now() + startHour * 3600_000;
    const sessions = [0, 6, 12].map((offset) => {
      const start = new Date(base + offset * 3600_000);
      return {
        scheduledStartAt: start.toISOString(),
        scheduledEndAt: new Date(start.getTime() + 3600_000).toISOString(),
      };
    });
    const booking = await studentClient.booking.createSeries({
      tutorId,
      availabilitySlotId: slotId,
      modality: "online",
      sessions,
      timezone: "Asia/Jakarta",
    });
    await tutorClient.tutorActions.acceptBooking({ bookingId: booking.id });
    return {
      bookingId: booking.id,
      sessions: await studentClient.booking.listSessions({
        bookingId: booking.id,
      }),
    };
  }

  async function createGroupSeries(startHour: number) {
    const base = Date.now() + startHour * 3600_000;
    const sessions = [0, 6, 12].map((offset) => {
      const start = new Date(base + offset * 3600_000);
      return {
        scheduledStartAt: start.toISOString(),
        scheduledEndAt: new Date(start.getTime() + 3600_000).toISOString(),
      };
    });
    const booking = await studentClient.booking.createGroupSeries({
      tutorId,
      availabilitySlotId: slotId,
      modality: "online",
      targetGroupSize: 2,
      inviteeUserIds: [inviteeId],
      sessions,
      timezone: "Asia/Jakarta",
    });
    await inviteeClient.booking.confirmInvite({ bookingId: booking.id });
    await tutorClient.tutorActions.acceptBooking({ bookingId: booking.id });
    return {
      bookingId: booking.id,
      sessions: await studentClient.booking.listSessions({
        bookingId: booking.id,
      }),
    };
  }

  test("solo no-show is charged once, report completion preserves future holds, and repeats do not settle again", async () => {
    const { bookingId, sessions } = await createSoloSeries(48);
    const first = sessions[0]!;
    const perSession =
      (await getParticipant(bookingId, studentId)).heldAmount / sessions.length;
    const walletBefore = await getWallet(studentId);
    const bookingBefore = (
      await db.select().from(bookingTable).where(eq(bookingTable.id, bookingId))
    )[0]!;
    expect(perSession).toBeGreaterThan(0);

    await backdateSession(first.id);
    const noShowKey = `booking.${bookingId}.no_show.${studentId}.${first.id}`;
    const deductedKey = `booking.${bookingId}.session.${first.id}.deduct`;
    const noShow = await tutorClient.tutorActions.markParticipantNoShow({
      bookingId,
      participantUserId: studentId,
      sessionId: first.id,
    });
    expect(noShow.forfeitedMarks).toBe(perSession);

    await expect(
      tutorClient.tutorActions.markParticipantNoShow({
        bookingId,
        participantUserId: studentId,
        sessionId: first.id,
      }),
    ).rejects.toThrow();
    expect((await getWallet(studentId)).heldBalance).toBe(
      walletBefore.heldBalance - perSession,
    );
    expect((await getParticipant(bookingId, studentId)).heldAmount).toBe(
      perSession * (sessions.length - 1),
    );
    const noShowEntries = await db
      .select()
      .from(ledgerEntry)
      .where(eq(ledgerEntry.eventKey, noShowKey));
    expect(noShowEntries).toHaveLength(1);
    expect(
      await db
        .select()
        .from(tutorSessionFee)
        .where(eq(tutorSessionFee.bookingId, bookingId)),
    ).toHaveLength(0);

    // A report confirms delivery; the no-show ledger entry already paid this
    // session's student allocation, so completion must preserve later holds.
    await tutorClient.tutorActions.completeSession({
      bookingId,
      sessionId: first.id,
      feedback: TEST_COMPLETION_FEEDBACK,
    });
    expect((await getWallet(studentId)).heldBalance).toBe(
      walletBefore.heldBalance - perSession,
    );
    expect((await getParticipant(bookingId, studentId)).heldAmount).toBe(
      perSession * (sessions.length - 1),
    );
    const afterFirstCompletion = (
      await db.select().from(bookingTable).where(eq(bookingTable.id, bookingId))
    )[0]!;
    expect(afterFirstCompletion.holdAmount).toBe(
      bookingBefore.holdAmount - perSession,
    );
    expect(
      await db
        .select()
        .from(ledgerEntry)
        .where(eq(ledgerEntry.eventKey, deductedKey)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(tutorSessionFee)
        .where(eq(tutorSessionFee.bookingId, bookingId)),
    ).toHaveLength(1);

    const second = sessions[1]!;
    await backdateSession(second.id);
    await tutorClient.tutorActions.completeSession({
      bookingId,
      sessionId: second.id,
      feedback: TEST_COMPLETION_FEEDBACK,
    });
    expect((await getWallet(studentId)).heldBalance).toBe(
      walletBefore.heldBalance - 2 * perSession,
    );
    expect((await getParticipant(bookingId, studentId)).heldAmount).toBe(
      perSession,
    );
    await expect(
      tutorClient.tutorActions.completeSession({
        bookingId,
        sessionId: second.id,
        feedback: TEST_COMPLETION_FEEDBACK,
      }),
    ).rejects.toThrow();
    expect(
      await db
        .select()
        .from(tutorSessionFee)
        .where(eq(tutorSessionFee.bookingId, bookingId)),
    ).toHaveLength(2);

    const third = sessions[2]!;
    await backdateSession(third.id);
    await tutorClient.tutorActions.completeSession({
      bookingId,
      sessionId: third.id,
      feedback: TEST_COMPLETION_FEEDBACK,
    });

    expect((await getWallet(studentId)).heldBalance).toBe(
      walletBefore.heldBalance - 3 * perSession,
    );
    expect((await getParticipant(bookingId, studentId)).heldAmount).toBe(0);
    const finishedBooking = (
      await db.select().from(bookingTable).where(eq(bookingTable.id, bookingId))
    )[0]!;
    expect(finishedBooking.currentState).toBe("completed");
    expect(finishedBooking.holdAmount).toBe(0);
    expect(
      await db
        .select()
        .from(tutorSessionFee)
        .where(eq(tutorSessionFee.bookingId, bookingId)),
    ).toHaveLength(3);
    expect(
      await db
        .select()
        .from(sessionCompletionFeedback)
        .where(eq(sessionCompletionFeedback.bookingId, bookingId)),
    ).toHaveLength(3);
  });

  test("cancellation rechecks a session after completion wins the lock race", async () => {
    const { bookingId, sessions } = await createSoloSeries(192);
    const first = sessions[0]!;
    const gate = await holdBookingRescheduleLock(bookingId);
    const cancellation = studentClient.booking
      .cancelSession({ sessionId: first.id })
      .then(
        () => ({ status: "fulfilled" as const }),
        (reason) => ({ status: "rejected" as const, reason }),
      );

    try {
      await waitForBlockedQuery("pg_advisory_xact_lock");
      // Cancellation has discovered the booking but is blocked before it reads
      // the locked session. Move through the start boundary, then let delivery
      // completion win before cancellation refreshes its state.
      await backdateSession(first.id);
      await tutorClient.tutorActions.completeSession({
        bookingId,
        sessionId: first.id,
        feedback: TEST_COMPLETION_FEEDBACK,
      });
      const afterCompletion = {
        wallet: await getWallet(studentId),
        participant: await getParticipant(bookingId, studentId),
        booking: (
          await db
            .select()
            .from(bookingTable)
            .where(eq(bookingTable.id, bookingId))
        )[0]!,
      };

      gate.release();
      await gate.transaction;
      expect((await cancellation).status).toBe("rejected");

      expect((await getWallet(studentId)).heldBalance).toBe(
        afterCompletion.wallet.heldBalance,
      );
      expect((await getParticipant(bookingId, studentId)).heldAmount).toBe(
        afterCompletion.participant.heldAmount,
      );
      const finalBooking = (
        await db
          .select()
          .from(bookingTable)
          .where(eq(bookingTable.id, bookingId))
      )[0]!;
      expect(finalBooking.holdAmount).toBe(afterCompletion.booking.holdAmount);
      expect(finalBooking.currentState).toBe("scheduled");
      expect(
        (await db
          .select()
          .from(bookingSession)
          .where(eq(bookingSession.id, first.id)))[0]!.currentState,
      ).toBe("completed");
      expect(
        await db
          .select()
          .from(tutorSessionFee)
          .where(eq(tutorSessionFee.bookingSessionId, first.id)),
      ).toHaveLength(1);
    } finally {
      gate.release();
      await gate.transaction;
    }
  });

  test("group-series no-show spends one absent allocation while delivered attendees settle with one fee", async () => {
    const { bookingId, sessions } = await createGroupSeries(84);
    const first = sessions[0]!;
    const perSession = first.holdAmount;
    const proposerBefore = await getWallet(studentId);
    const inviteeBefore = await getWallet(inviteeId);
    const proposerHoldBefore = (await getParticipant(bookingId, studentId))
      .heldAmount;
    const inviteeHoldBefore = (await getParticipant(bookingId, inviteeId))
      .heldAmount;

    await backdateSession(first.id);
    const noShowKey = `booking.${bookingId}.no_show.${inviteeId}.${first.id}`;
    const absentDeductKey = `booking.${bookingId}.session.${first.id}.deduct.${inviteeId}`;
    const proposerDeductKey = `booking.${bookingId}.session.${first.id}.deduct.${studentId}`;
    const noShow = await tutorClient.tutorActions.markParticipantNoShow({
      bookingId,
      participantUserId: inviteeId,
      sessionId: first.id,
    });
    expect(noShow.forfeitedMarks).toBe(perSession);
    await expect(
      tutorClient.tutorActions.markParticipantNoShow({
        bookingId,
        participantUserId: inviteeId,
        sessionId: first.id,
      }),
    ).rejects.toThrow();

    await tutorClient.tutorActions.completeSession({
      bookingId,
      sessionId: first.id,
      feedback: TEST_COMPLETION_FEEDBACK,
    });

    expect((await getWallet(studentId)).heldBalance).toBe(
      proposerBefore.heldBalance - perSession,
    );
    expect((await getWallet(inviteeId)).heldBalance).toBe(
      inviteeBefore.heldBalance - perSession,
    );
    expect((await getParticipant(bookingId, studentId)).heldAmount).toBe(
      proposerHoldBefore - perSession,
    );
    expect((await getParticipant(bookingId, inviteeId)).heldAmount).toBe(
      inviteeHoldBefore - perSession,
    );
    const entries = await db
      .select()
      .from(ledgerEntry)
      .where(eq(ledgerEntry.bookingId, bookingId));
    expect(
      entries.filter((entry) => entry.eventKey === noShowKey),
    ).toHaveLength(1);
    expect(
      entries.filter((entry) => entry.eventKey === absentDeductKey),
    ).toHaveLength(0);
    expect(
      entries.filter((entry) => entry.eventKey === proposerDeductKey),
    ).toHaveLength(1);
    expect(
      await db
        .select()
        .from(tutorSessionFee)
        .where(eq(tutorSessionFee.bookingId, bookingId)),
    ).toHaveLength(1);
    const absentInviteeReport =
      await inviteeClient.booking.listCompletionFeedback({
        bookingId,
      });
    expect(absentInviteeReport).toHaveLength(1);
    expect(absentInviteeReport[0]!.sessionId).toBe(first.id);
  });

  test("concurrent completion settles one report, one fee, and one allocation", async () => {
    const { bookingId, sessions } = await createSoloSeries(120);
    const first = sessions[0]!;
    const participantBefore = await getParticipant(bookingId, studentId);
    const perSession = participantBefore.heldAmount / sessions.length;
    const walletBefore = await getWallet(studentId);
    await backdateSession(first.id);

    const results = await Promise.allSettled([
      tutorClient.tutorActions.completeSession({
        bookingId,
        sessionId: first.id,
        feedback: TEST_COMPLETION_FEEDBACK,
      }),
      tutorClient.tutorActions.completeSession({
        bookingId,
        sessionId: first.id,
        feedback: TEST_COMPLETION_FEEDBACK,
      }),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    expect((await getWallet(studentId)).heldBalance).toBe(
      walletBefore.heldBalance - perSession,
    );
    expect((await getParticipant(bookingId, studentId)).heldAmount).toBe(
      participantBefore.heldAmount - perSession,
    );
    expect(
      await db
        .select()
        .from(tutorSessionFee)
        .where(eq(tutorSessionFee.bookingSessionId, first.id)),
    ).toHaveLength(1);
    expect(
      await db
        .select()
        .from(sessionCompletionFeedback)
        .where(eq(sessionCompletionFeedback.sessionId, first.id)),
    ).toHaveLength(1);
    expect(
      await db
        .select()
        .from(ledgerEntry)
        .where(
          eq(
            ledgerEntry.eventKey,
            `booking.${bookingId}.session.${first.id}.deduct`,
          ),
        ),
    ).toHaveLength(1);
  });

  test("no-show and completion race spends the session allocation exactly once", async () => {
    const { bookingId, sessions } = await createSoloSeries(144);
    const first = sessions[0]!;
    const participantBefore = await getParticipant(bookingId, studentId);
    const perSession = participantBefore.heldAmount / sessions.length;
    const walletBefore = await getWallet(studentId);
    await backdateSession(first.id);

    const [noShowResult, completionResult] = await Promise.allSettled([
      tutorClient.tutorActions.markParticipantNoShow({
        bookingId,
        participantUserId: studentId,
        sessionId: first.id,
      }),
      tutorClient.tutorActions.completeSession({
        bookingId,
        sessionId: first.id,
        feedback: TEST_COMPLETION_FEEDBACK,
      }),
    ]);
    expect(completionResult.status).toBe("fulfilled");
    if (noShowResult.status === "fulfilled") {
      expect(noShowResult.value.forfeitedMarks).toBe(perSession);
    } else {
      expect(noShowResult.reason).toBeDefined();
    }
    expect((await getWallet(studentId)).heldBalance).toBe(
      walletBefore.heldBalance - perSession,
    );
    expect((await getParticipant(bookingId, studentId)).heldAmount).toBe(
      participantBefore.heldAmount - perSession,
    );
    const entries = await db
      .select()
      .from(ledgerEntry)
      .where(eq(ledgerEntry.bookingId, bookingId));
    const settlementEntries = entries.filter(
      (entry) =>
        entry.eventKey ===
          `booking.${bookingId}.no_show.${studentId}.${first.id}` ||
        entry.eventKey === `booking.${bookingId}.session.${first.id}.deduct`,
    );
    expect(settlementEntries).toHaveLength(1);
    expect(
      await db
        .select()
        .from(tutorSessionFee)
        .where(eq(tutorSessionFee.bookingSessionId, first.id)),
    ).toHaveLength(1);
    expect(
      await db
        .select()
        .from(sessionCompletionFeedback)
        .where(eq(sessionCompletionFeedback.sessionId, first.id)),
    ).toHaveLength(1);
  });

  test("fee insertion failure rolls report, session, ledger, and hold changes back", async () => {
    const { bookingId, sessions } = await createSoloSeries(168);
    const first = sessions[0]!;
    await backdateSession(first.id);
    const participantBefore = await getParticipant(bookingId, studentId);
    const walletBefore = await getWallet(studentId);
    const bookingBefore = (
      await db.select().from(bookingTable).where(eq(bookingTable.id, bookingId))
    )[0]!;
    const [bookingRow] = await db
      .select()
      .from(bookingTable)
      .where(eq(bookingTable.id, bookingId));
    const [sessionBefore] = await db
      .select()
      .from(bookingSession)
      .where(eq(bookingSession.id, first.id));
    const sessionSnapshot =
      sessionBefore!.priceSnapshot ?? bookingRow!.priceSnapshot;
    const expectedFee = buildTutorSessionFeeRecord({
      bookingId,
      bookingSessionId: first.id,
      tutorId,
      scheduledStartAt: sessionBefore!.scheduledStartAt,
      earnedAt: new Date(),
      priceSnapshot: sessionSnapshot,
    });
    await db.insert(tutorSessionFee).values({
      ...expectedFee,
      grossHonorariumIdr: expectedFee.grossHonorariumIdr + 1,
    });

    await expect(
      tutorClient.tutorActions.completeSession({
        bookingId,
        sessionId: first.id,
        feedback: TEST_COMPLETION_FEEDBACK,
      }),
    ).rejects.toThrow();

    expect((await getWallet(studentId)).heldBalance).toBe(
      walletBefore.heldBalance,
    );
    expect((await getParticipant(bookingId, studentId)).heldAmount).toBe(
      participantBefore.heldAmount,
    );
    const bookingAfter = (
      await db.select().from(bookingTable).where(eq(bookingTable.id, bookingId))
    )[0]!;
    expect(bookingAfter.holdAmount).toBe(bookingBefore.holdAmount);
    const [sessionAfter] = await db
      .select()
      .from(bookingSession)
      .where(eq(bookingSession.id, first.id));
    expect(sessionAfter!.currentState).toBe("scheduled");
    expect(
      await db
        .select()
        .from(sessionCompletionFeedback)
        .where(eq(sessionCompletionFeedback.sessionId, first.id)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(ledgerEntry)
        .where(
          eq(
            ledgerEntry.eventKey,
            `booking.${bookingId}.session.${first.id}.deduct`,
          ),
        ),
    ).toHaveLength(0);
  });

  test("malformed V3 honorarium is rejected before settlement writes", async () => {
    const { bookingId, sessions } = await createSoloSeries(216);
    const first = sessions[0]!;
    await backdateSession(first.id);
    const malformedSnapshot = {
      engine: "v3",
      v3Revision: 7,
      competition: "competition-policy-debate",
      modality: "online",
      headcount: 1,
      perStudentMarks: 45,
      collectedMarks: 45,
    } as unknown as BookingPriceSnapshot;
    await db
      .update(bookingSession)
      .set({ priceSnapshot: malformedSnapshot })
      .where(eq(bookingSession.id, first.id));

    const participantBefore = await getParticipant(bookingId, studentId);
    const walletBefore = await getWallet(studentId);
    const bookingBefore = (
      await db.select().from(bookingTable).where(eq(bookingTable.id, bookingId))
    )[0]!;
    await expect(
      tutorClient.tutorActions.completeSession({
        bookingId,
        sessionId: first.id,
        feedback: TEST_COMPLETION_FEEDBACK,
      }),
    ).rejects.toThrow();

    expect((await getWallet(studentId)).heldBalance).toBe(
      walletBefore.heldBalance,
    );
    expect((await getParticipant(bookingId, studentId)).heldAmount).toBe(
      participantBefore.heldAmount,
    );
    expect(
      (
        await db
          .select()
          .from(bookingTable)
          .where(eq(bookingTable.id, bookingId))
      )[0]!.holdAmount,
    ).toBe(bookingBefore.holdAmount);
    expect(
      await db
        .select()
        .from(ledgerEntry)
        .where(
          eq(
            ledgerEntry.eventKey,
            `booking.${bookingId}.session.${first.id}.deduct`,
          ),
        ),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(sessionCompletionFeedback)
        .where(eq(sessionCompletionFeedback.sessionId, first.id)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(tutorSessionFee)
        .where(eq(tutorSessionFee.bookingSessionId, first.id)),
    ).toHaveLength(0);
  });
});
