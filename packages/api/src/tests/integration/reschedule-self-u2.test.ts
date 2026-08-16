import { describe, test, expect, beforeAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@cogito-app/db";
import {
  wallet,
  tutorInvite,
  tutorProfile,
  availabilitySlot,
  bookingRescheduleProposal,
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
  await signUpAndSignIn(email, "Test1234!", "Tutor U2");
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
      displayName: "Prof U2",
      token: `token-u2-${ts}`,
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
      displayName: "Prof U2",
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
      endDate: new Date(start.getTime() + 6 * 3600_000),
      modality: "both",
    })
    .returning();

  return { tutorId, slotId: slot!.id };
}

describe("U2: student self-service reschedule before H-2 (FR-14/TC-15)", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  const ts = Date.now();

  let studentClient: TestClient;
  let tutorClient: TestClient;
  let slotId: string;

  beforeAll(async () => {
    const studentRes = await signUpAndSignIn(
      `student.u2.${ts}@cogito.test`,
      "Test1234!",
      "Student U2",
    );
    studentClient = createTestClient(
      await createTestContext(studentRes.cookie),
    );
    const studentCtx = await createTestContext(studentRes.cookie);
    if (!studentCtx.session?.user) throw new Error("Student session missing");
    await creditWallet(studentCtx.session.user.id, 200);

    const tutor = await createPublishedTutor(`tutor.u2.${ts}@cogito.test`, ts);
    slotId = tutor.slotId;
    tutorClient = createTestClient(
      await createTestContext(
        (await signInAndGetCookie(`tutor.u2.${ts}@cogito.test`, "Test1234!")) ??
          "",
      ),
    );
  });

  let bookingOffset = 0;
  async function createAcceptedBooking() {
    bookingOffset += 1;
    const start = new Date(Date.now() + (48 + bookingOffset * 24) * 3600_000);
    const b = await studentClient.booking.createSolo({
      tutorId: (await db.select().from(tutorProfile).limit(1))[0]!.userId,
      availabilitySlotId: slotId,
      modality: "online",
      scheduledStartAt: start.toISOString(),
      scheduledEndAt: new Date(start.getTime() + 3600_000).toISOString(),
      timezone: "Asia/Jakarta",
    });
    await tutorClient.tutorActions.acceptBooking({ bookingId: b.id });
    return b;
  }

  test("U2: student proposes a reschedule pre-H-2 → tutor approves → booking moves", async () => {
    const b = await createAcceptedBooking();

    const newStart = new Date(Date.now() + 72 * 3600_000);
    const newEnd = new Date(Date.now() + 73 * 3600_000);
    await studentClient.booking.rescheduleSelf({
      bookingId: b.id,
      newStartAt: newStart.toISOString(),
      newEndAt: newEnd.toISOString(),
      reason: "Jadwal bentrok",
    });

    const fetched = await studentClient.booking.get({ bookingId: b.id });
    expect(fetched.currentState).toBe("reschedule_proposed");

    const [proposal] = await db
      .select()
      .from(bookingRescheduleProposal)
      .where(eq(bookingRescheduleProposal.bookingId, b.id))
      .limit(1);
    expect(proposal!.proposedBy).not.toBe(b.tutorId);

    // The tutor approves the student's proposal.
    await tutorClient.tutorActions.approveReschedule({ bookingId: b.id });

    const [row] = await db
      .select()
      .from(booking)
      .where(eq(booking.id, b.id))
      .limit(1);
    expect(row!.scheduledStartAt.getTime()).toBe(newStart.getTime());
    expect(row!.currentState).toBe("awaiting_reconfirmation");
  });

  test("U2: post-H-2 student reschedule is rejected", async () => {
    const b = await createAcceptedBooking();

    const tooSoon = new Date(Date.now() + 60 * 60 * 1000); // 1h out < H-2
    await expect(
      studentClient.booking.rescheduleSelf({
        bookingId: b.id,
        newStartAt: tooSoon.toISOString(),
        newEndAt: new Date(tooSoon.getTime() + 3600_000).toISOString(),
      }),
    ).rejects.toThrow(/editable/i);
  });

  test("U2: overlapping slot is rejected", async () => {
    const b1 = await createAcceptedBooking();
    const b2 = await createAcceptedBooking();

    // Propose a time overlapping the OTHER accepted booking.
    const [other] = await db
      .select()
      .from(booking)
      .where(eq(booking.id, b2.id))
      .limit(1);
    await expect(
      studentClient.booking.rescheduleSelf({
        bookingId: b1.id,
        newStartAt: other!.scheduledStartAt.toISOString(),
        newEndAt: other!.scheduledEndAt.toISOString(),
      }),
    ).rejects.toThrow(/conflict/i);
  });
});
