import { describe, test, expect, beforeAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@cogito-app/db";
import {
  wallet,
  tutorInvite,
  tutorProfile,
  availabilitySlot,
  bookingSession,
  bookingRescheduleProposal,
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
  await signUpAndSignIn(email, "Test1234!", "Tutor U7");
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
      displayName: "Prof U7",
      token: `token-u7-${ts}`,
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
      displayName: "Prof U7",
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

describe("U7: per-session tutor reschedule within a series (FR-20/TC-33)", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  const ts = Date.now();

  let studentClient: TestClient;
  let tutorClient: TestClient;
  let slotId: string;

  beforeAll(async () => {
    const studentRes = await signUpAndSignIn(
      `student.u7.${ts}@cogito.test`,
      "Test1234!",
      "Student U7",
    );
    studentClient = createTestClient(
      await createTestContext(studentRes.cookie),
    );
    const studentCtx = await createTestContext(studentRes.cookie);
    if (!studentCtx.session?.user) throw new Error("Student session missing");
    await creditWallet(studentCtx.session.user.id, 200);

    const tutor = await createPublishedTutor(`tutor.u7.${ts}@cogito.test`, ts);
    slotId = tutor.slotId;
    tutorClient = createTestClient(
      await createTestContext(
        (await signInAndGetCookie(`tutor.u7.${ts}@cogito.test`, "Test1234!")) ??
          "",
      ),
    );
  });

  let slotOffset = 0;
  async function createAcceptedSeries() {
    slotOffset += 1;
    // 72h between tests: no series/booking rows ever overlap.
    const base = (72 + slotOffset * 72) * 3600_000;
    const t1 = new Date(Date.now() + base);
    const t2 = new Date(Date.now() + base + 12 * 3600_000);
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
    return { bookingId: b.id, sessions };
  }

  test("U7: tutor proposes a new time for one session → student accepts → only that session moves", async () => {
    const { bookingId, sessions } = await createAcceptedSeries();
    const [first, second] = sessions;
    const firstBefore = first!.scheduledStartAt;
    const secondBefore = second!.scheduledStartAt;

    const proposedStart = new Date(
      Date.now() + (78 + slotOffset * 72) * 3600_000,
    );
    const proposedEnd = new Date(
      Date.now() + (79 + slotOffset * 72) * 3600_000,
    );
    await tutorClient.tutorActions.proposeReschedule({
      bookingId,
      proposedStartAt: proposedStart.toISOString(),
      proposedEndAt: proposedEnd.toISOString(),
      reason: "U7 session move",
      sessionId: first!.id,
    });

    const [proposal] = await db
      .select()
      .from(bookingRescheduleProposal)
      .where(eq(bookingRescheduleProposal.bookingId, bookingId))
      .limit(1);
    expect(proposal!.sessionId).toBe(first!.id);

    const fetched = await studentClient.booking.get({ bookingId });
    expect(fetched.currentState).toBe("reschedule_proposed");

    await studentClient.booking.acceptReschedule({ bookingId });

    const [moved] = await db
      .select()
      .from(bookingSession)
      .where(eq(bookingSession.id, first!.id))
      .limit(1);
    expect(moved!.scheduledStartAt.getTime()).toBeGreaterThan(
      firstBefore.getTime(),
    );
    expect(moved!.scheduledStartAt.getTime()).toBe(proposedStart.getTime());

    // The other session is untouched.
    const [untouched] = await db
      .select()
      .from(bookingSession)
      .where(eq(bookingSession.id, second!.id))
      .limit(1);
    expect(untouched!.scheduledStartAt.getTime()).toBe(secondBefore.getTime());
  });

  test("U7: a session reschedule proposal that overlaps another commitment is rejected", async () => {
    const { bookingId, sessions } = await createAcceptedSeries();
    const target = sessions[0]!;
    const other = sessions[1]!;

    // Propose a time that overlaps the OTHER session of the same series.
    await expect(
      tutorClient.tutorActions.proposeReschedule({
        bookingId,
        proposedStartAt: other.scheduledStartAt.toISOString(),
        proposedEndAt: other.scheduledEndAt.toISOString(),
        sessionId: target.id,
        reason: "Avoid an overlapping session",
      }),
    ).rejects.toThrow(/conflict/i);
  });
});
