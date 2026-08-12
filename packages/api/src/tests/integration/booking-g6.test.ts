import { describe, test, expect, beforeAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@cogito-app/db";
import {
  wallet,
  tutorInvite,
  tutorProfile,
  availabilitySlot,
  bookingRescheduleProposal,
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

async function createPublishedTutor(email: string, ts: number) {
  await signUpAndSignIn(email, "Test1234!", "Tutor G6");
  const tutorCookie = await signInAndGetCookie(email, "Test1234!");
  const tutorCtx = await createTestContext(tutorCookie ?? "");
  if (!tutorCtx.session?.user) throw new Error("Tutor session missing");
  const tutorId = tutorCtx.session.user.id;
  await setUserRole(tutorId, "tutor");

  const [invite] = await db
    .insert(tutorInvite)
    .values({
      email,
      displayName: "Prof G6",
      token: `token-g6-${ts}`,
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
      displayName: "Prof G6",
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

  const start = new Date(Date.now() + 24 * 3600_000);
  const end = new Date(Date.now() + 25 * 3600_000);
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

describe("G6: tutor reschedule with student approval", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  const ts = Date.now();
  const tutorEmail = `tutor.g6.${ts}@cogito.test`;
  const studentEmail = `student.g6.${ts}@cogito.test`;
  let studentClient: TestClient;
  let tutorClient: TestClient;
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
      "Student G6",
    );
    studentClient = createTestClient(
      await createTestContext(studentRes.cookie),
    );
    const studentCtx = await createTestContext(studentRes.cookie);
    studentId = studentCtx.session?.user.id!;
    await creditWallet(studentId, 200);

    const tutorCookie = await signInAndGetCookie(tutorEmail, "Test1234!");
    tutorClient = createTestClient(await createTestContext(tutorCookie));
  });

  let bookingCounter = 0;

  async function createSoloBooking() {
    bookingCounter += 1;
    const base = Date.now() + (50 + bookingCounter * 10) * 3600_000;
    const start = new Date(base).toISOString();
    const end = new Date(base + 3600_000).toISOString();
    const b = await studentClient.booking.createSolo({
      tutorId,
      availabilitySlotId: slotId,
      modality: "online",
      scheduledStartAt: start,
      scheduledEndAt: end,
      timezone: "Asia/Jakarta",
    });
    return b.id;
  }

  test("student cannot propose a reschedule (tutor-only)", async () => {
    const id = await createSoloBooking();
    await expect(
      studentClient.tutorActions.proposeReschedule({
        bookingId: id,
        proposedStartAt: new Date(Date.now() + 72 * 3600_000),
        proposedEndAt: new Date(Date.now() + 73 * 3600_000),
        reason: "nope",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("tutor proposes a reschedule → student notified", async () => {
    const id = await createSoloBooking();
    bookingId = id;
    const start = new Date(Date.now() + 72 * 3600_000);
    const end = new Date(Date.now() + 73 * 3600_000);

    const updated = await tutorClient.tutorActions.proposeReschedule({
      bookingId,
      proposedStartAt: start,
      proposedEndAt: end,
      reason: "schedule conflict",
    });
    expect(updated.currentState).toBe("reschedule_proposed");

    const proposals = await db
      .select()
      .from(bookingRescheduleProposal)
      .where(eq(bookingRescheduleProposal.bookingId, bookingId));
    expect(proposals.length).toBe(1);
    expect(proposals[0]!.proposedBy).toBe(tutorId);
    expect(proposals[0]!.status).toBe("pending");

    const notifs = await db
      .select()
      .from(notification)
      .where(
        eq(notification.eventKey, `booking.${bookingId}.reschedule_proposed`),
      );
    expect(notifs.length).toBe(1);
    expect(notifs[0]!.userId).toBe(studentId);
  });

  test("student accepts → time updated, awaiting_reconfirmation, tutor notified", async () => {
    const updated = await studentClient.booking.acceptReschedule({
      bookingId,
    });
    expect(updated.currentState).toBe("awaiting_reconfirmation");

    const b = await studentClient.booking.get({ bookingId });
    expect(b.scheduledStartAt.getTime()).toBeGreaterThan(
      Date.now() + 60 * 3600_000,
    );

    const [proposal] = await db
      .select()
      .from(bookingRescheduleProposal)
      .where(eq(bookingRescheduleProposal.bookingId, bookingId));
    expect(proposal!.status).toBe("accepted");
    expect(proposal!.decidedAt).not.toBeNull();

    const notifs = await db
      .select()
      .from(notification)
      .where(
        eq(notification.eventKey, `booking.${bookingId}.reschedule_accepted`),
      );
    expect(notifs.length).toBe(1);
    expect(notifs[0]!.userId).toBe(tutorId);
  });

  test("tutor cannot accept/reject (student-only)", async () => {
    const id = await createSoloBooking();
    await tutorClient.tutorActions.proposeReschedule({
      bookingId: id,
      proposedStartAt: new Date(Date.now() + 72 * 3600_000),
      proposedEndAt: new Date(Date.now() + 73 * 3600_000),
    });

    await expect(
      tutorClient.booking.acceptReschedule({ bookingId: id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      tutorClient.booking.rejectReschedule({ bookingId: id }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  test("student rejects → proposal rejected, booking unchanged, tutor notified", async () => {
    const id = await createSoloBooking();
    const original = await studentClient.booking.get({ bookingId: id });
    const originalStart = original.scheduledStartAt.getTime();

    await tutorClient.tutorActions.proposeReschedule({
      bookingId: id,
      proposedStartAt: new Date(Date.now() + 72 * 3600_000),
      proposedEndAt: new Date(Date.now() + 73 * 3600_000),
      reason: "conflict",
    });

    const updated = await studentClient.booking.rejectReschedule({
      bookingId: id,
    });
    expect(updated.currentState).toBe("awaiting_tutor_review");

    const after = await studentClient.booking.get({ bookingId: id });
    expect(after.scheduledStartAt.getTime()).toBe(originalStart);

    const [proposal] = await db
      .select()
      .from(bookingRescheduleProposal)
      .where(eq(bookingRescheduleProposal.bookingId, id));
    expect(proposal!.status).toBe("rejected");

    const notifs = await db
      .select()
      .from(notification)
      .where(eq(notification.eventKey, `booking.${id}.reschedule_rejected`));
    expect(notifs.length).toBe(1);
    expect(notifs[0]!.userId).toBe(tutorId);
  });
});
