import { describe, test, expect, beforeAll } from "bun:test";
import { eq, and } from "drizzle-orm";
import { db } from "@cogito-app/db";
import {
  wallet,
  ledgerEntry,
  tutorInvite,
  tutorProfile,
  availabilitySlot,
  booking as bookingTable,
  bookingParticipant,
  bookingSession,
  sessionCompletionFeedback,
  tutorSessionFee,
  auditLog,
  notification,
} from "@cogito-app/db/schema";

import {
  createTestContext,
  createTestClient,
  signUpAndSignIn,
  setUserRole,
  resetDatabase,
  type TestClient,
} from "../helpers/test-client";
import { TEST_COMPLETION_FEEDBACK } from "../helpers/completion-feedback";

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

async function createPublishedTutor(
  email: string,
  ts: number,
): Promise<{ tutorId: string; slotId: string }> {
  await signUpAndSignIn(email, "Test1234!", "Tutor U6");
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
      displayName: "Prof U6",
      token: `token-u6-${ts}`,
      status: "accepted",
      invitedBy: tutorId,
      expiresAt: new Date(Date.now() + 86400000),
      acceptedBy: tutorId,
      acceptedAt: new Date(),
    })
    .returning();

  await db
    .insert(tutorProfile)
    .values({
      userId: tutorId,
      inviteId: invite!.id,
      shortBio: "Bio",
      modality: "both",
      prices: { "1": 50, "2": 45, "3": 40, "4": 35, "5": 30, "6": 28 },
      onboardingStatus: "published",
      publishedAt: new Date(),
    })
    .execute();

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

async function walletOf(userId: string) {
  const [w] = await db
    .select()
    .from(wallet)
    .where(eq(wallet.userId, userId))
    .limit(1);
  if (!w) throw new Error(`wallet missing for ${userId}`);
  return w;
}

describe("U6: admin per-session series cancel with Marks choice (FR-20/TC-31)", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  const ts = Date.now();

  let adminClient: TestClient;
  let tutorClient: TestClient;
  let slotId: string;

  beforeAll(async () => {
    const adminRes = await signUpAndSignIn(
      `admin.u6.${ts}@cogito.test`,
      "Test1234!",
      "Admin U6",
    );
    const adminCtx = await createTestContext(adminRes.cookie);
    if (!adminCtx.session?.user) throw new Error("Admin session missing");
    await setUserRole(adminCtx.session.user.id, "admin");
    adminClient = createTestClient(await createTestContext(adminRes.cookie));

    const tutor = await createPublishedTutor(`tutor.u6.${ts}@cogito.test`, ts);
    slotId = tutor.slotId;
    tutorClient = createTestClient(
      await createTestContext(
        (await signInAndGetCookie(`tutor.u6.${ts}@cogito.test`, "Test1234!")) ??
          "",
      ),
    );
  });

  // Each test gets a fresh student so wallet state never leaks between cases.
  async function freshStudent(tag: string) {
    const res = await signUpAndSignIn(
      `student.u6.${tag}.${Date.now()}@cogito.test`,
      "Test1234!",
      "Student U6",
    );
    const client = createTestClient(await createTestContext(res.cookie));
    const ctx = await createTestContext(res.cookie);
    if (!ctx.session?.user) throw new Error("Student session missing");
    await creditWallet(ctx.session.user.id, 200);
    return { client, studentId: ctx.session.user.id };
  }

  let slotOffset = 0;
  async function createAcceptedSeries(
    studentClient: TestClient,
    sessionCount = 2,
  ) {
    slotOffset += 1;
    const base = (66 + slotOffset * 24) * 3600_000;
    const requestedSessions = Array.from({ length: sessionCount }, (_, i) => {
      const start = new Date(Date.now() + base + i * 6 * 3600_000);
      return {
        scheduledStartAt: start.toISOString(),
        scheduledEndAt: new Date(start.getTime() + 3600_000).toISOString(),
      };
    });
    const b = await studentClient.booking.createSeries({
      tutorId: (await db.select().from(tutorProfile).limit(1))[0]!.userId,
      availabilitySlotId: slotId,
      modality: "online",
      sessions: requestedSessions,
      timezone: "Asia/Jakarta",
    });
    await tutorClient.tutorActions.acceptBooking({ bookingId: b.id });
    const sessions = await studentClient.booking.listSessions({
      bookingId: b.id,
    });
    return { bookingId: b.id, session: sessions[0]!, sessions };
  }

  async function createAcceptedGroupSeries(
    studentClient: TestClient,
    inviteeClient: TestClient,
    inviteeId: string,
  ) {
    slotOffset += 1;
    const base = (66 + slotOffset * 24) * 3600_000;
    const requestedSessions = Array.from({ length: 3 }, (_, i) => {
      const start = new Date(Date.now() + base + i * 6 * 3600_000);
      return {
        scheduledStartAt: start.toISOString(),
        scheduledEndAt: new Date(start.getTime() + 3600_000).toISOString(),
      };
    });
    const b = await studentClient.booking.createGroupSeries({
      tutorId: (await db.select().from(tutorProfile).limit(1))[0]!.userId,
      availabilitySlotId: slotId,
      modality: "online",
      targetGroupSize: 2,
      inviteeUserIds: [inviteeId],
      sessions: requestedSessions,
      timezone: "Asia/Jakarta",
    });
    await inviteeClient.booking.confirmInvite({ bookingId: b.id });
    await tutorClient.tutorActions.acceptBooking({ bookingId: b.id });
    return {
      bookingId: b.id,
      sessions: await studentClient.booking.listSessions({
        bookingId: b.id,
      }),
    };
  }

  test("U6: cancel with release returns the session hold and cancels the session", async () => {
    const { client, studentId } = await freshStudent("release");
    const { bookingId, session } = await createAcceptedSeries(client);
    const before = await walletOf(studentId);

    const result = await adminClient.adminBooking.cancelSeriesSession({
      sessionId: session.id,
      marksAction: "release",
    });
    expect(result.currentState).toBe("cancelled");

    const after = await walletOf(studentId);
    // release moves held -> available; the total is unchanged.
    expect(after.availableBalance).toBe(
      before.availableBalance + session.holdAmount,
    );

    const [row] = await db
      .select()
      .from(bookingSession)
      .where(eq(bookingSession.id, session.id))
      .limit(1);
    expect(row!.currentState).toBe("cancelled");
    expect(row!.holdAmount).toBe(0);

    const logs = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.action, "admin_cancel_series_session"),
          eq(auditLog.targetId, session.id),
        ),
      );
    expect(logs.length).toBe(1);

    const notifs = await db
      .select()
      .from(notification)
      .where(eq(notification.bookingId, bookingId));
    expect(notifs.some((n) => n.title === "Session cancelled by admin")).toBe(
      true,
    );
  });

  test("U6: cancel with forfeit deducts the session hold", async () => {
    const { client, studentId } = await freshStudent("forfeit");
    const { bookingId, session } = await createAcceptedSeries(client);
    const before = await walletOf(studentId);

    const result = await adminClient.adminBooking.cancelSeriesSession({
      sessionId: session.id,
      marksAction: "forfeit",
    });
    expect(result.currentState).toBe("cancelled");

    const after = await walletOf(studentId);
    // forfeit removes the session hold from the total.
    expect(after.totalBalance).toBe(before.totalBalance - session.holdAmount);

    const entries = await db
      .select()
      .from(ledgerEntry)
      .where(
        and(
          eq(ledgerEntry.bookingId, bookingId),
          eq(ledgerEntry.entryType, "deduct"),
        ),
      );
    expect(entries.some((e) => e.reason.includes("forfeit"))).toBe(true);
  });

  test("U6: cancel with partial returns only the given amount", async () => {
    const { client, studentId } = await freshStudent("partial");
    const { session } = await createAcceptedSeries(client);
    const before = await walletOf(studentId);

    await adminClient.adminBooking.cancelSeriesSession({
      sessionId: session.id,
      marksAction: "partial",
      amount: 10,
    });

    const after = await walletOf(studentId);
    expect(after.availableBalance).toBe(before.availableBalance + 10);
  });

  async function runSoloCancelThenComplete(
    marksAction: "release" | "forfeit" | "partial",
  ) {
    const { client, studentId } = await freshStudent(`settle-${marksAction}`);
    const { bookingId, sessions } = await createAcceptedSeries(client, 3);
    const cancelledSession = sessions[0]!;
    const perSession = cancelledSession.holdAmount;
    const walletBefore = await walletOf(studentId);
    const [bookingBefore] = await db
      .select()
      .from(bookingTable)
      .where(eq(bookingTable.id, bookingId));
    const [participantBefore] = await db
      .select()
      .from(bookingParticipant)
      .where(eq(bookingParticipant.bookingId, bookingId));

    expect(bookingBefore!.holdAmount).toBe(participantBefore!.heldAmount);

    await adminClient.adminBooking.cancelSeriesSession({
      sessionId: cancelledSession.id,
      marksAction,
      ...(marksAction === "partial" ? { amount: 10 } : {}),
    });
    const cancelledAmount = marksAction === "partial" ? 10 : perSession;

    const walletAfterCancel = await walletOf(studentId);
    const [bookingAfterCancel] = await db
      .select()
      .from(bookingTable)
      .where(eq(bookingTable.id, bookingId));
    const [participantAfterCancel] = await db
      .select()
      .from(bookingParticipant)
      .where(eq(bookingParticipant.bookingId, bookingId));

    expect(participantAfterCancel!.heldAmount).toBe(
      participantBefore!.heldAmount - cancelledAmount,
    );
    expect(bookingAfterCancel!.holdAmount).toBe(
      participantAfterCancel!.heldAmount,
    );
    expect(bookingAfterCancel!.holdAmount).toBe(
      bookingBefore!.holdAmount - cancelledAmount,
    );
    expect(walletAfterCancel.heldBalance).toBe(
      walletBefore.heldBalance - cancelledAmount,
    );
    if (marksAction !== "forfeit") {
      expect(walletAfterCancel.availableBalance).toBe(
        walletBefore.availableBalance + cancelledAmount,
      );
      expect(walletAfterCancel.totalBalance).toBe(walletBefore.totalBalance);
    } else {
      expect(walletAfterCancel.totalBalance).toBe(
        walletBefore.totalBalance - perSession,
      );
    }

    const remainingSessions = sessions.slice(1);
    await Promise.all(
      remainingSessions.map((session) =>
        db
          .update(bookingSession)
          .set({
            scheduledStartAt: new Date(Date.now() - 2 * 3600_000),
            scheduledEndAt: new Date(Date.now() - 1 * 3600_000),
          })
          .where(eq(bookingSession.id, session.id)),
      ),
    );
    for (const session of remainingSessions) {
      // eslint-disable-next-line no-await-in-loop
      await tutorClient.tutorActions.completeSession({
        bookingId,
        sessionId: session.id,
        feedback: TEST_COMPLETION_FEEDBACK,
      });
    }

    const finalWallet = await walletOf(studentId);
    const [finalBooking] = await db
      .select()
      .from(bookingTable)
      .where(eq(bookingTable.id, bookingId));
    const [finalParticipant] = await db
      .select()
      .from(bookingParticipant)
      .where(eq(bookingParticipant.bookingId, bookingId));
    const finalSessions = await db
      .select()
      .from(bookingSession)
      .where(eq(bookingSession.seriesBookingId, bookingId));

    expect(finalBooking!.currentState).toBe("completed");
    expect(finalBooking!.holdAmount).toBe(0);
    expect(finalParticipant!.heldAmount).toBe(0);
    expect(finalWallet.heldBalance).toBe(0);
    expect(finalWallet.totalBalance).toBe(
      walletBefore.totalBalance -
        perSession * (sessions.length - 1) -
        (marksAction === "forfeit" ? perSession : 0),
    );
    expect(
      finalSessions.filter((session) => session.currentState === "cancelled"),
    ).toHaveLength(1);
    expect(
      finalSessions.filter((session) => session.currentState === "completed"),
    ).toHaveLength(2);
    expect(
      await db
        .select()
        .from(tutorSessionFee)
        .where(eq(tutorSessionFee.bookingId, bookingId)),
    ).toHaveLength(2);
    expect(
      await db
        .select()
        .from(sessionCompletionFeedback)
        .where(eq(sessionCompletionFeedback.bookingId, bookingId)),
    ).toHaveLength(2);
  }

  test("U6: release then complete remaining solo sessions settles the parent", async () => {
    await runSoloCancelThenComplete("release");
  });

  test("U6: forfeit then complete remaining solo sessions settles the parent", async () => {
    await runSoloCancelThenComplete("forfeit");
  });

  test("U6: partial release leaves residual held until terminal series cleanup", async () => {
    await runSoloCancelThenComplete("partial");
  });

  test("U6: group-series cancellation reconciles confirmed holds through completion", async () => {
    const proposer = await freshStudent("group-settlement-proposer");
    const invitee = await freshStudent("group-settlement-invitee");
    const { bookingId, sessions } = await createAcceptedGroupSeries(
      proposer.client,
      invitee.client,
      invitee.studentId,
    );
    const cancelledSession = sessions[0]!;
    const perSession = cancelledSession.holdAmount;
    const participantsBefore = await db
      .select()
      .from(bookingParticipant)
      .where(eq(bookingParticipant.bookingId, bookingId));
    const confirmedBefore = participantsBefore.filter(
      (participant) =>
        participant.confirmationState === "confirmed" ||
        participant.confirmationState === "reconfirmed",
    );
    const walletsBefore = await Promise.all([
      walletOf(proposer.studentId),
      walletOf(invitee.studentId),
    ]);
    const [bookingBefore] = await db
      .select()
      .from(bookingTable)
      .where(eq(bookingTable.id, bookingId));

    expect(confirmedBefore).toHaveLength(2);
    expect(bookingBefore!.holdAmount).toBe(
      confirmedBefore.reduce(
        (sum, participant) => sum + participant.heldAmount,
        0,
      ),
    );

    await adminClient.adminBooking.cancelSeriesSession({
      sessionId: cancelledSession.id,
      marksAction: "release",
    });

    const participantsAfterCancel = await db
      .select()
      .from(bookingParticipant)
      .where(eq(bookingParticipant.bookingId, bookingId));
    const confirmedAfterCancel = participantsAfterCancel.filter(
      (participant) =>
        participant.confirmationState === "confirmed" ||
        participant.confirmationState === "reconfirmed",
    );
    const [bookingAfterCancel] = await db
      .select()
      .from(bookingTable)
      .where(eq(bookingTable.id, bookingId));
    const [proposerWalletAfterCancel, inviteeWalletAfterCancel] =
      await Promise.all([
        walletOf(proposer.studentId),
        walletOf(invitee.studentId),
      ]);

    expect(bookingAfterCancel!.holdAmount).toBe(
      confirmedAfterCancel.reduce(
        (sum, participant) => sum + participant.heldAmount,
        0,
      ),
    );
    expect(bookingAfterCancel!.holdAmount).toBe(
      bookingBefore!.holdAmount - perSession * confirmedBefore.length,
    );
    expect(proposerWalletAfterCancel.heldBalance).toBe(
      walletsBefore[0]!.heldBalance - perSession,
    );
    expect(inviteeWalletAfterCancel.heldBalance).toBe(
      walletsBefore[1]!.heldBalance - perSession,
    );

    const remainingSessions = sessions.slice(1);
    await Promise.all(
      remainingSessions.map((session) =>
        db
          .update(bookingSession)
          .set({
            scheduledStartAt: new Date(Date.now() - 2 * 3600_000),
            scheduledEndAt: new Date(Date.now() - 1 * 3600_000),
          })
          .where(eq(bookingSession.id, session.id)),
      ),
    );
    for (const session of remainingSessions) {
      // eslint-disable-next-line no-await-in-loop
      await tutorClient.tutorActions.completeSession({
        bookingId,
        sessionId: session.id,
        feedback: TEST_COMPLETION_FEEDBACK,
      });
    }

    const [finalBooking] = await db
      .select()
      .from(bookingTable)
      .where(eq(bookingTable.id, bookingId));
    const finalParticipants = await db
      .select()
      .from(bookingParticipant)
      .where(eq(bookingParticipant.bookingId, bookingId));
    const finalWallets = await Promise.all([
      walletOf(proposer.studentId),
      walletOf(invitee.studentId),
    ]);

    expect(finalBooking!.currentState).toBe("completed");
    expect(finalBooking!.holdAmount).toBe(0);
    expect(
      finalParticipants.every((participant) => participant.heldAmount === 0),
    ).toBe(true);
    expect(finalWallets.map((account) => account.heldBalance)).toEqual([0, 0]);
    expect(finalWallets.map((account) => account.totalBalance)).toEqual(
      walletsBefore.map(
        (account) => account.totalBalance - perSession * (sessions.length - 1),
      ),
    );
    expect(
      await db
        .select()
        .from(tutorSessionFee)
        .where(eq(tutorSessionFee.bookingId, bookingId)),
    ).toHaveLength(2);
    expect(
      await db
        .select()
        .from(sessionCompletionFeedback)
        .where(eq(sessionCompletionFeedback.bookingId, bookingId)),
    ).toHaveLength(2);
  });
});
