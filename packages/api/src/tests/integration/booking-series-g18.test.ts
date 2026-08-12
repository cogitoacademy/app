import { describe, test, expect, beforeAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@cogito-app/db";
import {
  wallet,
  tutorInvite,
  tutorProfile,
  availabilitySlot,
  booking as bookingTable,
  bookingParticipant,
  bookingSession,
  notification as notificationTable,
} from "@cogito-app/db/schema";

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
  const res = await signUpAndSignIn(email, "Test1234!", "Prof Series");
  const signupCtx = await createTestContext(res.cookie);
  const tutorId = signupCtx.session!.user.id;
  await setUserRole(tutorId, "tutor");

  const tutorCookie = await signInAndGetCookie(email, "Test1234!");
  const tutorClient = createTestClient(
    await createTestContext(tutorCookie ?? ""),
  );

  const [invite] = await db
    .insert(tutorInvite)
    .values({
      email,
      displayName: "Prof Series",
      token: `token-s18-${ts}`,
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
      displayName: "Prof Series",
      shortBio: "Bio",
      credentialsSummary: "Creds",
      expertise: ["Mathematics"],
      modality: "both",
      prices: { "1": 50, "2": 45, "3": 40, "4": 35, "5": 30, "6": 28 },
      availabilitySummary: "Flexible",
      onboardingStatus: "published",
      publishedAt: new Date(),
    })
    .execute();

  const start = new Date(Date.now() + 48 * 3600_000);
  const end = new Date(Date.now() + 49 * 3600_000);
  const [slot] = await db
    .insert(availabilitySlot)
    .values({ tutorId, startDate: start, endDate: end, modality: "both" })
    .returning();

  return { tutorId, tutorClient, slotId: slot!.id };
}

describe("Series session completion (G18)", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  const ts = Date.now();
  const studentEmail = `student.s18.${ts}@cogito.test`;
  const tutorEmail = `tutor.s18.${ts}@cogito.test`;

  let studentClient: TestClient;
  let tutorClient: TestClient;
  let studentId: string;
  let tutorId: string;
  let slotId: string;
  let bookingId: string;
  let sessionIds: string[] = [];
  const perSession = 50;

  beforeAll(async () => {
    const studentRes = await signUpAndSignIn(
      studentEmail,
      "Test1234!",
      "Student Series18",
    );
    studentClient = createTestClient(
      await createTestContext(studentRes.cookie),
    );
    const studentCtx = await createTestContext(studentRes.cookie);
    studentId = studentCtx.session!.user.id;
    await creditWallet(studentId, 500);

    const tutorData = await createPublishedTutor(tutorEmail, ts);
    tutorId = tutorData.tutorId;
    tutorClient = tutorData.tutorClient;
    slotId = tutorData.slotId;
  });

  test("create 3-session series and accept → scheduled with 150 held", async () => {
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
    expect(b.holdAmount).toBe(3 * perSession);

    const updated = await tutorClient.tutorActions.acceptBooking({ bookingId });
    expect(updated.currentState).toBe("scheduled");

    const w = await studentClient.wallet.get({});
    expect(w.heldBalance).toBe(3 * perSession);

    const listed = await studentClient.booking.listSessions({ bookingId });
    sessionIds = listed.map((s) => s.id);
    expect(sessionIds.length).toBe(3);
  });

  test("attempt to complete a future session → rejected", async () => {
    await expect(
      tutorClient.tutorActions.completeSession({
        bookingId,
        sessionId: sessionIds[0]!,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  test("completing session 1 of 3 → session completed, perSession deducted, booking still scheduled", async () => {
    await db
      .update(bookingSession)
      .set({ scheduledStartAt: new Date(Date.now() - 3600_000) })
      .where(eq(bookingSession.id, sessionIds[0]!));

    const result = await tutorClient.tutorActions.completeSession({
      bookingId,
      sessionId: sessionIds[0]!,
    });
    expect(result.currentState).toBe("scheduled");

    const [session] = await db
      .select()
      .from(bookingSession)
      .where(eq(bookingSession.id, sessionIds[0]!));
    expect(session!.currentState).toBe("completed");

    const w = await studentClient.wallet.get({});
    expect(w.heldBalance).toBe(2 * perSession);

    const [booking] = await db
      .select()
      .from(bookingTable)
      .where(eq(bookingTable.id, bookingId));
    expect(booking!.holdAmount).toBe(2 * perSession);

    const [participant] = await db
      .select()
      .from(bookingParticipant)
      .where(eq(bookingParticipant.bookingId, bookingId));
    expect(participant!.heldAmount).toBe(2 * perSession);
  });

  test("double-completing session 1 → rejected", async () => {
    await expect(
      tutorClient.tutorActions.completeSession({
        bookingId,
        sessionId: sessionIds[0]!,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  test("completing sessions 2 and 3 → booking completed, remainder released", async () => {
    await db
      .update(bookingSession)
      .set({ scheduledStartAt: new Date(Date.now() - 3600_000) })
      .where(eq(bookingSession.seriesBookingId, bookingId));

    const r2 = await tutorClient.tutorActions.completeSession({
      bookingId,
      sessionId: sessionIds[1]!,
    });
    expect(r2.currentState).toBe("scheduled");

    const r3 = await tutorClient.tutorActions.completeSession({
      bookingId,
      sessionId: sessionIds[2]!,
    });
    expect(r3.currentState).toBe("completed");

    const [booking] = await db
      .select()
      .from(bookingTable)
      .where(eq(bookingTable.id, bookingId));
    expect(booking!.currentState).toBe("completed");
    expect(booking!.holdAmount).toBe(0);

    const w = await studentClient.wallet.get({});
    expect(w.heldBalance).toBe(0);

    const [participant] = await db
      .select()
      .from(bookingParticipant)
      .where(eq(bookingParticipant.bookingId, bookingId));
    expect(participant!.heldAmount).toBe(0);

    const allSessions = await db
      .select()
      .from(bookingSession)
      .where(eq(bookingSession.seriesBookingId, bookingId));
    expect(allSessions.every((s) => s.currentState === "completed")).toBe(true);
  });

  test("series completion writes per-session and final notifications", async () => {
    const perSessionNotifs = await db
      .select()
      .from(notificationTable)
      .where(
        eq(
          notificationTable.eventKey,
          `booking.${bookingId}.session.${sessionIds[0]!}.completed.student`,
        ),
      );
    expect(perSessionNotifs.length).toBe(1);

    const finalNotifs = await db
      .select()
      .from(notificationTable)
      .where(
        eq(
          notificationTable.eventKey,
          `booking.${bookingId}.series_completed.student`,
        ),
      );
    expect(finalNotifs.length).toBe(1);
  });
});
