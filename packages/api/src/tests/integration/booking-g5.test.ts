import { describe, test, expect, beforeAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@cogito-app/db";
import {
  wallet,
  tutorInvite,
  tutorProfile,
  availabilitySlot,
  bookingSession,
} from "@cogito-app/db/schema";

import {
  createTestContext,
  createTestClient,
  signUpAndSignIn,
  setUserRole,
  resetDatabase,
  type TestClient,
} from "../helpers/test-client";
import { GROUP_SERIES_DISCLAIMER } from "../../shared/constants";

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
  await signUpAndSignIn(email, "Test1234!", "Tutor G5");
  const tutorCookie = await signInAndGetCookie(email, "Test1234!");
  const tutorCtx = await createTestContext(tutorCookie ?? "");
  if (!tutorCtx.session?.user) throw new Error("Tutor session missing");
  const tutorId = tutorCtx.session.user.id;
  await setUserRole(tutorId, "tutor");

  const [invite] = await db
    .insert(tutorInvite)
    .values({
      email,
      displayName: "Prof G5",
      token: `token-g5-${ts}`,
      status: "accepted",
      invitedBy: tutorId,
      expiresAt: new Date(Date.now() + 86400000),
      acceptedBy: tutorId,
      acceptedAt: new Date(),
    })
    .returning();

  const [profile] = await db
    .insert(tutorProfile)
    .values({
      userId: tutorId,
      inviteId: invite!.id,
      displayName: "Prof G5",
      shortBio: "Bio",
      credentialsSummary: "Creds",
      expertise: ["Mathematics"],
      modality: "both",
      prices: { "1": 50, "2": 45, "3": 40, "4": 35, "5": 30, "6": 28 },
      availabilitySummary: "Flexible",
      onboardingStatus: "published",
      publishedAt: new Date(),
    })
    .returning();

  const start = new Date(Date.now() + 1 * 3600_000);
  const end = new Date(start.getTime() + 7 * 24 * 3600_000);
  const [slot] = await db
    .insert(availabilitySlot)
    .values({
      tutorId,
      startDate: start,
      endDate: end,
      modality: "both",
    })
    .returning();

  return { tutorId, profileId: profile!.id, slotId: slot!.id };
}

describe("G5: series session cancellation rules", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  const ts = Date.now();
  const tutorEmail = `tutor.g5.${ts}@cogito.test`;
  const studentEmail = `student.g5.${ts}@cogito.test`;
  let studentClient: TestClient;
  let tutorId: string;
  let slotId: string;
  let bookingId: string;
  let studentId: string;

  beforeAll(async () => {
    const tutorData = await createPublishedTutor(tutorEmail, ts);
    tutorId = tutorData.tutorId;
    slotId = tutorData.slotId;

    const studentRes = await signUpAndSignIn(
      studentEmail,
      "Test1234!",
      "Student G5",
    );
    studentClient = createTestClient(
      await createTestContext(studentRes.cookie),
    );
    const studentCtx = await createTestContext(studentRes.cookie);
    if (!studentCtx.session?.user)
      throw new Error("test setup: expected student session user");
    studentId = studentCtx.session.user.id;
    await creditWallet(studentId, 500);
  });

  test("create solo series with 3 sessions", async () => {
    const sessions = [
      {
        scheduledStartAt: new Date(Date.now() + 48 * 3600_000).toISOString(),
        scheduledEndAt: new Date(Date.now() + 49 * 3600_000).toISOString(),
      },
      {
        scheduledStartAt: new Date(Date.now() + 72 * 3600_000).toISOString(),
        scheduledEndAt: new Date(Date.now() + 73 * 3600_000).toISOString(),
      },
      {
        scheduledStartAt: new Date(Date.now() + 96 * 3600_000).toISOString(),
        scheduledEndAt: new Date(Date.now() + 97 * 3600_000).toISOString(),
      },
    ];

    const b = await studentClient.booking.createSeries({
      tutorId,
      availabilitySlotId: slotId,
      modality: "online",
      sessions,
      timezone: "Asia/Jakarta",
    });

    bookingId = b.id;
    expect(b.currentState).toBe("awaiting_tutor_review");
    expect(b.type).toBe("series");
    expect(b.disclaimer).toBeNull();
  });

  test("cancel one series session 3h+ before start → allowed, hold released", async () => {
    const sessions = await studentClient.booking.listSessions({ bookingId });
    expect(sessions.length).toBe(3);

    const target = sessions.find(
      (s) => s.scheduledStartAt.getTime() - Date.now() > 2 * 3600_000,
    )!;

    const wBefore = await studentClient.wallet.get({});
    const result = await studentClient.booking.cancelSession({
      sessionId: target.id,
    });
    expect(result.cancelled).toBe(true);

    const [row] = await db
      .select()
      .from(bookingSession)
      .where(eq(bookingSession.id, target.id));
    expect(row!.currentState).toBe("cancelled");
    expect(row!.holdAmount).toBe(0);

    const wAfter = await studentClient.wallet.get({});
    expect(wAfter.heldBalance).toBe(wBefore.heldBalance - 50);
  });

  test("TC-30: cancel a series session inside H-2 → forfeits the session hold", async () => {
    const sessions = await studentClient.booking.listSessions({ bookingId });
    const target = sessions.find((s) => s.currentState === "scheduled")!;

    // nudge the session to be within 2h of start
    await db
      .update(bookingSession)
      .set({ scheduledStartAt: new Date(Date.now() + 60 * 60 * 1000) })
      .where(eq(bookingSession.id, target.id));

    const wBefore = await studentClient.wallet.get({});
    const result = await studentClient.booking.cancelSession({
      sessionId: target.id,
    });
    expect(result.cancelled).toBe(true);
    expect(result.forfeited).toBe(true);

    const [row] = await db
      .select()
      .from(bookingSession)
      .where(eq(bookingSession.id, target.id));
    expect(row!.currentState).toBe("cancelled");

    const wAfter = await studentClient.wallet.get({});
    // Forfeiting a 50-mark session hold deducts from the total balance.
    expect(wAfter.totalBalance).toBe(wBefore.totalBalance - 50);
    expect(wAfter.heldBalance).toBe(wBefore.heldBalance - 50);
  });

  test("group series bookings cannot have individual sessions cancelled", async () => {
    const { booking: bookingTable } = await import("@cogito-app/db/schema");
    const start = new Date(Date.now() + 48 * 3600_000);
    const priceSnapshot = {
      perStudent: 40,
      baseline: 120,
      tutorShare: 96,
      cogitoTake: 24,
    };

    // Insert a group series directly (no creation flow exists in the API)
    const [groupSeries] = await db
      .insert(bookingTable)
      .values({
        id: crypto.randomUUID(),
        type: "series",
        modality: "online",
        tutorId,
        proposerId: studentId,
        targetGroupSize: 3,
        minConfirmedHeadcount: 2,
        confirmedHeadcount: 3,
        currentState: "scheduled",
        scheduledStartAt: start,
        scheduledEndAt: new Date(start.getTime() + 3600_000),
        timezone: "Asia/Jakarta",
        priceSnapshot,
        originalMarks: 120,
        holdAmount: 120,
        deadlineAt: new Date(Date.now() + 86400000),
      })
      .returning();

    const [session] = await db
      .insert(bookingSession)
      .values({
        seriesBookingId: groupSeries!.id,
        scheduledStartAt: start,
        scheduledEndAt: new Date(start.getTime() + 3600_000),
        currentState: "scheduled",
        holdAmount: 40,
        priceSnapshot: {
          perStudent: 40,
          baseline: 40,
          tutorShare: 32,
          cogitoTake: 8,
        },
      })
      .returning();

    await expect(
      studentClient.booking.cancelSession({ sessionId: session!.id }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  test("group series get response includes the disclaimer (G15)", async () => {
    const { booking: bookingTable } = await import("@cogito-app/db/schema");
    const start = new Date(Date.now() + 48 * 3600_000);
    const priceSnapshot = {
      perStudent: 40,
      baseline: 120,
      tutorShare: 96,
      cogitoTake: 24,
    };

    const [groupSeries] = await db
      .insert(bookingTable)
      .values({
        id: crypto.randomUUID(),
        type: "series",
        modality: "online",
        tutorId,
        proposerId: studentId,
        targetGroupSize: 3,
        minConfirmedHeadcount: 2,
        confirmedHeadcount: 3,
        currentState: "scheduled",
        scheduledStartAt: start,
        scheduledEndAt: new Date(start.getTime() + 3600_000),
        timezone: "Asia/Jakarta",
        priceSnapshot,
        originalMarks: 120,
        holdAmount: 120,
        deadlineAt: new Date(Date.now() + 86400000),
      })
      .returning();

    const b = await studentClient.booking.get({
      bookingId: groupSeries!.id,
    });
    expect(b.disclaimer).toBe(GROUP_SERIES_DISCLAIMER);
  });
});
