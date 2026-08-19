import { describe, test, expect, beforeAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@cogito-app/db";
import {
  wallet,
  tutorInvite,
  tutorProfile,
  availabilitySlot,
  bookingParticipant,
  booking,
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
  await signUpAndSignIn(email, "Test1234!", "Tutor M4");
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
      displayName: "Prof M4",
      token: `token-m4-${ts}`,
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
      displayName: "Prof M4",
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

describe("M4: student cancelSession caps release at participant.heldAmount", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  const ts = Date.now();

  let tutorClient: TestClient;
  let studentClient: TestClient;
  let studentId: string;
  let slotId: string;
  let tutorId: string;

  beforeAll(async () => {
    const studentRes = await signUpAndSignIn(
      `student.m4.${ts}@cogito.test`,
      "Test1234!",
      "Student M4",
    );
    studentClient = createTestClient(
      await createTestContext(studentRes.cookie),
    );
    const studentCtx = await createTestContext(studentRes.cookie);
    if (!studentCtx.session?.user) throw new Error("Student session missing");
    studentId = studentCtx.session.user.id;
    await creditWallet(studentId, 600);

    const tutor = await createPublishedTutor(`tutor.m4.${ts}@cogito.test`, ts);
    slotId = tutor.slotId;
    tutorId = tutor.tutorId;
    tutorClient = createTestClient(
      await createTestContext(
        (await signInAndGetCookie(`tutor.m4.${ts}@cogito.test`, "Test1234!")) ??
          "",
      ),
    );
  });

  test("student cancelSession caps the release at the participant's remaining held amount", async () => {
    const t1 = new Date(Date.now() + 66 * 3600_000);
    const t2 = new Date(Date.now() + 72 * 3600_000);
    const b = await studentClient.booking.createSeries({
      tutorId,
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
    expect(sessions).toHaveLength(2);
    const [s1, s2] = sessions;
    expect(s1!.holdAmount).toBe(50);

    // A second booking holds another 50 marks in the SAME pooled wallet. Any
    // over-release from session 2's cancellation would draw from this hold.
    const otherStart = new Date(Date.now() + 96 * 3600_000);
    const otherBooking = await studentClient.booking.createSolo({
      tutorId,
      availabilitySlotId: slotId,
      modality: "online",
      scheduledStartAt: otherStart.toISOString(),
      scheduledEndAt: new Date(otherStart.getTime() + 3600_000).toISOString(),
      timezone: "Asia/Jakarta",
    });
    await tutorClient.tutorActions.acceptBooking({
      bookingId: otherBooking.id,
    });

    // Simulate the reduced state M4 describes: an admin `cancelSeriesSession`
    // already released part of the participant's hold, so the participant now
    // holds LESS than session 2's holdAmount (50). Set participant.heldAmount
    // and booking.holdAmount to 20 (the real admin path decrements these).
    const [participant] = await db
      .select()
      .from(bookingParticipant)
      .where(eq(bookingParticipant.bookingId, b.id));
    await db
      .update(bookingParticipant)
      .set({ heldAmount: 20 })
      .where(eq(bookingParticipant.id, participant!.id));
    await db
      .update(booking)
      .set({ holdAmount: 20 })
      .where(eq(booking.id, b.id));

    const wBefore = await db
      .select()
      .from(wallet)
      .where(eq(wallet.userId, studentId))
      .limit(1);
    const heldBefore = wBefore[0]!.heldBalance; // 20 (booking) + 50 (other) = 70

    // Student cancels session 2 pre-H2 → releases at most the participant's
    // remaining held amount (20), NOT session.holdAmount (50).
    await studentClient.booking.cancelSession({ sessionId: s2!.id });

    const wAfter = await db
      .select()
      .from(wallet)
      .where(eq(wallet.userId, studentId))
      .limit(1);
    // Only 20 released; the other booking's 50 hold is untouched.
    expect(wAfter[0]!.heldBalance).toBe(heldBefore - 20);

    const [pAfter] = await db
      .select()
      .from(bookingParticipant)
      .where(eq(bookingParticipant.bookingId, b.id));
    expect(pAfter!.heldAmount).toBe(0);
  });
});
