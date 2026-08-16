import { describe, test, expect, beforeAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@cogito-app/db";
import {
  wallet,
  ledgerEntry,
  tutorInvite,
  tutorProfile,
  availabilitySlot,
  booking,
  bookingSession,
  bookingParticipant,
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
  await signUpAndSignIn(email, "Test1234!", "Tutor U5");
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
      displayName: "Prof U5",
      token: `token-u5-${ts}`,
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
      displayName: "Prof U5",
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

describe("U5: per-participant no-show marking (FR-20/TC-30)", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  const ts = Date.now();

  let studentClient: TestClient;
  let tutorClient: TestClient;
  let studentId: string;
  let slotId: string;

  beforeAll(async () => {
    const studentRes = await signUpAndSignIn(
      `student.u5.${ts}@cogito.test`,
      "Test1234!",
      "Student U5",
    );
    studentClient = createTestClient(
      await createTestContext(studentRes.cookie),
    );
    const studentCtx = await createTestContext(studentRes.cookie);
    if (!studentCtx.session?.user) throw new Error("Student session missing");
    studentId = studentCtx.session.user.id;
    await creditWallet(studentId, 200);

    const tutor = await createPublishedTutor(`tutor.u5.${ts}@cogito.test`, ts);
    slotId = tutor.slotId;
    tutorClient = createTestClient(
      await createTestContext(
        (await signInAndGetCookie(`tutor.u5.${ts}@cogito.test`, "Test1234!")) ??
          "",
      ),
    );
  });

  test("U5: solo no-show after start+15min forfeits the hold and transitions to NO_SHOW", async () => {
    const futureStart = new Date(Date.now() + 48 * 3600_000);
    const b = await studentClient.booking.createSolo({
      tutorId: (await db.select().from(tutorProfile).limit(1))[0]!.userId,
      availabilitySlotId: slotId,
      modality: "online",
      scheduledStartAt: futureStart.toISOString(),
      scheduledEndAt: new Date(futureStart.getTime() + 3600_000).toISOString(),
      timezone: "Asia/Jakarta",
    });
    await tutorClient.tutorActions.acceptBooking({ bookingId: b.id });
    // Backdate the session so the no-show window (start+15min) has passed.
    await db
      .update(booking)
      .set({
        scheduledStartAt: new Date(Date.now() - 2 * 3600_000),
        scheduledEndAt: new Date(Date.now() - 1 * 3600_000),
      })
      .where(eq(booking.id, b.id));

    const result = await tutorClient.tutorActions.markParticipantNoShow({
      bookingId: b.id,
      participantUserId: studentId,
    });
    expect(result.forfeitedMarks).toBe(50);

    const fetched = await studentClient.booking.get({ bookingId: b.id });
    expect(fetched.currentState).toBe("no_show");

    const w = await db
      .select()
      .from(wallet)
      .where(eq(wallet.userId, studentId))
      .limit(1);
    expect(w[0]!.availableBalance).toBe(150);

    const entries = await db
      .select()
      .from(ledgerEntry)
      .where(eq(ledgerEntry.bookingId, b.id));
    expect(entries.some((e) => e.entryType === "deduct")).toBe(true);

    const notifs = await db
      .select()
      .from(notification)
      .where(eq(notification.bookingId, b.id));
    expect(notifs.some((n) => n.title === "Session marked as no-show")).toBe(
      true,
    );
  });

  test("U5: no-show cannot be marked before start+15min", async () => {
    const start = new Date(Date.now() + 48 * 3600_000);
    const end = new Date(Date.now() + 49 * 3600_000);
    const b = await studentClient.booking.createSolo({
      tutorId: (await db.select().from(tutorProfile).limit(1))[0]!.userId,
      availabilitySlotId: slotId,
      modality: "online",
      scheduledStartAt: start.toISOString(),
      scheduledEndAt: end.toISOString(),
      timezone: "Asia/Jakarta",
    });
    await tutorClient.tutorActions.acceptBooking({ bookingId: b.id });

    await expect(
      tutorClient.tutorActions.markParticipantNoShow({
        bookingId: b.id,
        participantUserId: studentId,
      }),
    ).rejects.toThrow(/editable/i);
  });

  test("U5: series participant no-show forfeits the session hold; booking stays scheduled", async () => {
    const t1 = new Date(Date.now() + 66 * 3600_000);
    const t2 = new Date(Date.now() + 72 * 3600_000);
    const b = await studentClient.booking.createSeries({
      tutorId: (await db.select().from(tutorProfile).limit(1))[0]!.userId,
      availabilitySlotId: slotId,
      modality: "online",
      sessions: [
        {
          scheduledStartAt: t1.toISOString(),
          scheduledEndAt: new Date(t1.getTime() + 3600_000).toISOString(),
        },
        {
          scheduledStartAt: t2.toISOString(),
          scheduledEndAt: new Date(t2.getTime() + 3600_000).toISOString(),
        },
      ],
      timezone: "Asia/Jakarta",
    });
    await tutorClient.tutorActions.acceptBooking({ bookingId: b.id });

    const sessions = await studentClient.booking.listSessions({
      bookingId: b.id,
    });
    const firstSession = sessions[0];
    // Backdate the first session so the no-show window has passed.
    await db
      .update(bookingSession)
      .set({
        scheduledStartAt: new Date(Date.now() - 2 * 3600_000),
        scheduledEndAt: new Date(Date.now() - 1 * 3600_000),
      })
      .where(eq(bookingSession.id, firstSession!.id));

    const result = await tutorClient.tutorActions.markParticipantNoShow({
      bookingId: b.id,
      participantUserId: studentId,
      sessionId: firstSession!.id,
    });
    expect(result.forfeitedMarks).toBeGreaterThan(0);

    const fetched = await studentClient.booking.get({ bookingId: b.id });
    expect(fetched.currentState).toBe("scheduled");

    const [participant] = await db
      .select()
      .from(bookingParticipant)
      .where(
        eq(bookingParticipant.bookingId, b.id) &&
          eq(bookingParticipant.userId, studentId),
      );
    expect(participant!.attendanceState).toBe("absent");
  });
});
