import { describe, test, expect, beforeAll } from "bun:test";
import { eq, and } from "drizzle-orm";
import { db } from "@cogito-app/db";
import {
  booking,
  wallet,
  tutorInvite,
  tutorProfile,
  availabilitySlot,
  bookingRescheduleProposal,
} from "@cogito-app/db/schema";

import { services } from "@cogito-app/api/services";
import {
  createTestContext,
  createTestClient,
  signUpAndSignIn,
  setUserRole,
  resetDatabase,
  type TestClient,
} from "../helpers/test-client";
import { getWalletByUserId } from "../helpers/factories";
import {
  RESPONSE_WINDOW_MS,
  OFFLINE_SCHEDULED_GRACE_MS,
  SESSION_DURATION_MS,
} from "../../shared/constants";
import { BOOKING_STATE } from "../../modules/booking/booking-state.types";
import { createBookingRepo } from "../../modules/booking/booking.repo";

const DAY = 24 * 3600_000;
const repo = createBookingRepo(db);

async function creditWallet(userId: string, amount: number) {
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
): Promise<{ tutorId: string; slotId: string; cookie: string }> {
  await signUpAndSignIn(email, "Test1234!", "Prof Deadline2");
  const cookie = (await signInAndGetCookie(email, "Test1234!")) ?? "";
  const tutorCtx = await createTestContext(cookie);
  if (!tutorCtx.session?.user) throw new Error("Tutor session missing");
  const tutorId = tutorCtx.session.user.id;
  await setUserRole(tutorId, "tutor");

  const [invite] = await db
    .insert(tutorInvite)
    .values({
      email,
      displayName: "Prof Deadline2",
      token: `token-resched-deadline-${ts}`,
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
      displayName: "Prof Deadline2",
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

  // Wide window: covers both the original session (+24h) and a reschedule 14
  // days out (the H1 bug scenario).
  const start = new Date(Date.now() + 1 * 3600_000);
  const end = new Date(start.getTime() + 45 * DAY);
  const [slot] = await db
    .insert(availabilitySlot)
    .values({ tutorId, startDate: start, endDate: end, modality: "both" })
    .returning();

  return { tutorId, slotId: slot!.id, cookie };
}

async function getBookingRow(bookingId: string) {
  const [row] = await db
    .select()
    .from(booking)
    .where(eq(booking.id, bookingId));
  if (!row) throw new Error(`booking ${bookingId} not found`);
  return row;
}

describe("H1: accepted reschedule refreshes the deadline for scheduled/room-approval targets", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  const ts = Date.now();
  const adminEmail = `admin.rescheddl.${ts}@cogito.test`;

  let adminClient: TestClient;
  let studentClient: TestClient;
  let tutorClient: TestClient;
  let studentId: string;
  let tutorId: string;
  let slotId: string;
  let roomId: string;

  beforeAll(async () => {
    const adminRes = await signUpAndSignIn(adminEmail, "Test1234!", "Admin");
    const adminCtx = await createTestContext(adminRes.cookie);
    if (!adminCtx.session?.user) throw new Error("Admin session missing");
    await setUserRole(adminCtx.session.user.id, "admin");
    adminClient = createTestClient(await createTestContext(adminRes.cookie));

    const studentRes = await signUpAndSignIn(
      `student.rescheddl.${ts}@cogito.test`,
      "Test1234!",
      "Student",
    );
    const studentCtx = await createTestContext(studentRes.cookie);
    if (!studentCtx.session?.user) throw new Error("Student session missing");
    studentId = studentCtx.session.user.id;
    await creditWallet(studentId, 200);
    studentClient = createTestClient(
      await createTestContext(studentRes.cookie),
    );

    const t = await createPublishedTutor(
      `tutor.rescheddl.${ts}@cogito.test`,
      ts,
    );
    tutorId = t.tutorId;
    slotId = t.slotId;
    tutorClient = createTestClient(await createTestContext(t.cookie));

    const room = await adminClient.room.create({
      name: "Ruang Deadline",
      location: "Lantai 2",
      capacity: 10,
    });
    roomId = room.id;
  });

  let seq = 0;

  async function createOnlineAcceptedBooking() {
    seq += 1;
    const start = new Date(Date.now() + (24 + seq * 2) * 3600_000);
    const end = new Date(start.getTime() + 3600_000);
    const b = await studentClient.booking.createSolo({
      tutorId,
      availabilitySlotId: slotId,
      modality: "online",
      scheduledStartAt: start.toISOString(),
      scheduledEndAt: end.toISOString(),
      timezone: "Asia/Jakarta",
    });
    await tutorClient.tutorActions.acceptBooking({ bookingId: b.id });
    const row = await getBookingRow(b.id);
    expect(row.currentState).toBe(BOOKING_STATE.SCHEDULED);
    return b;
  }

  async function createOfflineScheduledBooking() {
    seq += 1;
    const start = new Date(Date.now() + (24 + seq * 2) * 3600_000);
    const end = new Date(start.getTime() + 3600_000);
    const b = await studentClient.booking.createSolo({
      tutorId,
      availabilitySlotId: slotId,
      modality: "offline",
      scheduledStartAt: start.toISOString(),
      scheduledEndAt: end.toISOString(),
      timezone: "Asia/Jakarta",
    });
    await tutorClient.tutorActions.acceptBooking({ bookingId: b.id });
    await adminClient.room.assign({
      bookingId: b.id,
      roomId,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
    });
    const row = await getBookingRow(b.id);
    expect(row.currentState).toBe(BOOKING_STATE.SCHEDULED);
    return b;
  }

  test("online accepted reschedule 14 days out sets deadline from proposedEnd+24h (not now+24h) and survives the expiry sweep", async () => {
    const b = await createOnlineAcceptedBooking();

    const proposedStart = new Date(Date.now() + 14 * DAY);
    const proposedEnd = new Date(proposedStart.getTime() + SESSION_DURATION_MS);
    await studentClient.booking.proposeReschedule({
      bookingId: b.id,
      proposedStartAt: proposedStart.toISOString(),
      proposedEndAt: proposedEnd.toISOString(),
      reason: "Dua minggu lagi",
      availabilitySlotId: slotId,
    });

    const acceptedAt = Date.now();
    const accept = await tutorClient.booking.acceptReschedule({
      bookingId: b.id,
    });
    expect(accept.currentState).toBe(BOOKING_STATE.SCHEDULED);

    const row = await getBookingRow(b.id);
    expect(row.scheduledStartAt.getTime()).toBe(proposedStart.getTime());
    const deadlineMs = row.deadlineAt!.getTime();
    // NOT the proposal-era now+24h deadline: far beyond 30h from acceptance.
    expect(deadlineMs).toBeGreaterThan(acceptedAt + 30 * 3600_000);
    // Derived from the new session end, not from acceptance time.
    expect(Math.abs(deadlineMs - (proposedEnd.getTime() + DAY))).toBeLessThan(
      60_000,
    );

    // The expiry sweep must NOT auto-expire / NO_SHOW it 24h later.
    const result = await services.booking.expireBookings();
    expect(result.failed).toBe(0);
    const after = await getBookingRow(b.id);
    expect(after.currentState).toBe(BOOKING_STATE.SCHEDULED);
    expect(after.holdAmount).toBeGreaterThan(0);
    expect(after.deadlineAt!.getTime()).toBe(deadlineMs);
    const walletRow = await getWalletByUserId(studentId);
    expect(walletRow!.heldBalance).toBeGreaterThan(0);
  });

  test("offline accepted reschedule 14 days out sets deadline from proposedEnd+2h grace", async () => {
    const b = await createOfflineScheduledBooking();

    const proposedStart = new Date(Date.now() + 16 * DAY);
    const proposedEnd = new Date(proposedStart.getTime() + SESSION_DURATION_MS);
    await studentClient.booking.proposeReschedule({
      bookingId: b.id,
      proposedStartAt: proposedStart.toISOString(),
      proposedEndAt: proposedEnd.toISOString(),
      reason: "Geser dua minggu",
      availabilitySlotId: slotId,
    });

    const acceptedAt = Date.now();
    await tutorClient.booking.acceptReschedule({ bookingId: b.id });

    const row = await getBookingRow(b.id);
    expect(row.currentState).toBe(BOOKING_STATE.SCHEDULED);
    const deadlineMs = row.deadlineAt!.getTime();
    expect(deadlineMs).toBeGreaterThan(acceptedAt + 30 * 3600_000);
    expect(
      Math.abs(
        deadlineMs - (proposedEnd.getTime() + OFFLINE_SCHEDULED_GRACE_MS),
      ),
    ).toBeLessThan(60_000);

    const result = await services.booking.expireBookings();
    expect(result.failed).toBe(0);
    const after = await getBookingRow(b.id);
    expect(after.currentState).toBe(BOOKING_STATE.SCHEDULED);
    expect(after.holdAmount).toBeGreaterThan(0);
  });

  test("AWAITING_TUTOR_REVIEW target keeps the 12h response window (regression)", async () => {
    // A booking still awaiting tutor review (never accepted) can be
    // rescheduled; accepting returns it to AWAITING_TUTOR_REVIEW with the
    // original 12h window.
    seq += 1;
    const start = new Date(Date.now() + (24 + seq) * 3600_000);
    const end = new Date(start.getTime() + 3600_000);
    const b = await studentClient.booking.createSolo({
      tutorId,
      availabilitySlotId: slotId,
      modality: "online",
      scheduledStartAt: start.toISOString(),
      scheduledEndAt: end.toISOString(),
      timezone: "Asia/Jakarta",
    });

    const proposedStart = new Date(Date.now() + 72 * 3600_000);
    const proposedEnd = new Date(proposedStart.getTime() + SESSION_DURATION_MS);
    await studentClient.booking.proposeReschedule({
      bookingId: b.id,
      proposedStartAt: proposedStart.toISOString(),
      proposedEndAt: proposedEnd.toISOString(),
      reason: "Belum dijawab tutor",
      availabilitySlotId: slotId,
    });

    await tutorClient.booking.acceptReschedule({ bookingId: b.id });

    const row = await getBookingRow(b.id);
    expect(row.currentState).toBe(BOOKING_STATE.AWAITING_TUTOR_REVIEW);
    const expectedCap = Date.now() + RESPONSE_WINDOW_MS;
    expect(row.deadlineAt!.getTime()).toBeGreaterThan(expectedCap - 60_000);
    expect(row.deadlineAt!.getTime()).toBeLessThan(expectedCap + 60_000);
  });

  test("expired RESCHEDULE_PROPOSED still returns to SCHEDULED with original time retained (proposal expiry intact)", async () => {
    const b = await createOnlineAcceptedBooking();
    const before = await getBookingRow(b.id);
    const originalEnd = before.scheduledEndAt.getTime();

    const proposedStart = new Date(Date.now() + 5 * DAY);
    const proposedEnd = new Date(proposedStart.getTime() + SESSION_DURATION_MS);
    await studentClient.booking.proposeReschedule({
      bookingId: b.id,
      proposedStartAt: proposedStart.toISOString(),
      proposedEndAt: proposedEnd.toISOString(),
      reason: "Batal ganti",
      availabilitySlotId: slotId,
    });

    const pendingRow = await getBookingRow(b.id);
    expect(pendingRow.currentState).toBe(BOOKING_STATE.RESCHEDULE_PROPOSED);
    await repo.updateBookingDeadline(db, b.id, new Date(Date.now() - 60_000));

    const result = await services.booking.expireBookings();
    expect(result.failed).toBe(0);

    const [proposal] = await db
      .select()
      .from(bookingRescheduleProposal)
      .where(
        and(
          eq(bookingRescheduleProposal.bookingId, b.id),
          eq(bookingRescheduleProposal.status, "expired"),
        ),
      )
      .limit(1);
    expect(proposal).toBeDefined();

    const row = await getBookingRow(b.id);
    // Returns to the previous state, NOT expired/NO_SHOW, and the original
    // schedule is retained (the proposal's new time was never applied).
    expect(row.currentState).toBe(BOOKING_STATE.SCHEDULED);
    expect(row.scheduledEndAt.getTime()).toBe(originalEnd);
    expect(row.scheduledStartAt.getTime()).toBe(
      before.scheduledStartAt.getTime(),
    );
    expect(row.holdAmount).toBeGreaterThan(0);
    const walletRow = await getWalletByUserId(studentId);
    expect(walletRow!.heldBalance).toBeGreaterThan(0);
  });
});
