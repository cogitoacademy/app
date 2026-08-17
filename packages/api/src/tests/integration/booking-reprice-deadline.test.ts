import { describe, test, expect, beforeAll } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "@cogito-app/db";
import {
  booking,
  bookingParticipant,
  notification,
  tutorInvite,
  tutorProfile,
  availabilitySlot,
} from "@cogito-app/db/schema";

import { services } from "@cogito-app/api/services";
import { resetDatabase } from "../helpers/test-client";
import {
  createTestUser,
  createTestWallet,
  getWalletByUserId,
} from "../helpers/factories";
import { createBookingRepo } from "../../modules/booking/booking.repo";
import {
  ACTOR_TYPE,
  BOOKING_TYPE,
  MODALITY,
  RESPONSE_WINDOW_MS,
} from "../../shared/constants";
import { BOOKING_STATE } from "../../modules/booking/booking-state.types";

const repo = createBookingRepo(db);

async function createPublishedTutor(email: string, ts: number) {
  const tutor = await createTestUser(email, "tutor");

  const [invite] = await db
    .insert(tutorInvite)
    .values({
      email,
      displayName: "Prof Deadline",
      token: `token-deadline-${ts}`,
      status: "accepted",
      invitedBy: tutor.id,
      expiresAt: new Date(Date.now() + 86400000),
      acceptedBy: tutor.id,
      acceptedAt: new Date(),
    })
    .returning();

  await db.insert(tutorProfile).values({
    userId: tutor.id,
    inviteId: invite!.id,
    displayName: "Prof Deadline",
    shortBio: "Bio",
    credentialsSummary: "Creds",
    expertise: ["Mathematics"],
    modality: "both",
    prices: { "1": 50, "2": 45, "3": 40, "4": 35, "5": 30, "6": 28 },
    availabilitySummary: "Flexible",
    onboardingStatus: "published",
    publishedAt: new Date(),
  });

  const start = new Date(Date.now() + 1 * 3600_000);
  const [slot] = await db
    .insert(availabilitySlot)
    .values({
      tutorId: tutor.id,
      startDate: start,
      endDate: new Date(start.getTime() + 2 * 3600_000),
      modality: "both",
    })
    .returning();

  return { tutorId: tutor.id, slotId: slot!.id };
}

async function holdMarks(userId: string, amount: number, bookingId: string) {
  const w = await getWalletByUserId(userId);
  if (!w) throw new Error(`wallet missing for ${userId}`);
  await services.wallet.hold(db, {
    walletId: w.id,
    amount,
    eventKey: `booking.${bookingId}.hold.${userId}`,
    sourceReference: bookingId,
    bookingId,
    actorType: ACTOR_TYPE.STUDENT,
    reason: "Hold Marks for seeded group booking",
  });
}

/**
 * Seeds a group booking in AWAITING_PARTICIPANT_CONFIRMATION with the given
 * confirmed participants (each holding `heldAmount`), a past deadline, and
 * matching wallet holds. Mirrors the state a real 3-of-5 group reaches after
 * the invitees confirm.
 */
async function seedPartialGroup(params: {
  tutorId: string;
  confirmedUserIds: string[];
  targetGroupSize: number;
  perStudent: number;
  state?: string;
}) {
  const start = new Date(Date.now() + 1 * 3600_000);
  const b = await repo.insertBooking(db, {
    id: crypto.randomUUID(),
    type: BOOKING_TYPE.GROUP,
    modality: MODALITY.ONLINE,
    tutorId: params.tutorId,
    proposerId: params.confirmedUserIds[0]!,
    targetGroupSize: params.targetGroupSize,
    minConfirmedHeadcount: 2,
    confirmedHeadcount: params.confirmedUserIds.length,
    currentState:
      params.state ?? BOOKING_STATE.AWAITING_PARTICIPANT_CONFIRMATION,
    scheduledStartAt: start,
    scheduledEndAt: new Date(start.getTime() + 3600_000),
    timezone: "Asia/Jakarta",
    priceSnapshot: {
      perStudent: params.perStudent,
      baseline: params.perStudent * params.targetGroupSize,
      tutorShare: params.perStudent * params.targetGroupSize * 0.8,
      cogitoTake: params.perStudent * params.targetGroupSize * 0.2,
    },
    originalMarks: params.perStudent * params.targetGroupSize,
    holdAmount: params.perStudent * params.confirmedUserIds.length,
    deadlineAt: new Date(Date.now() - 60_000),
  });

  for (const [index, userId] of params.confirmedUserIds.entries()) {
    await repo.insertParticipant(db, {
      bookingId: b.id,
      userId,
      role: index === 0 ? "proposer" : "invitee",
      confirmationState: "confirmed",
      heldAmount: params.perStudent,
    });
  }

  for (const userId of params.confirmedUserIds) {
    await holdMarks(userId, params.perStudent, b.id);
  }

  return b;
}

describe("Scheduler: group deadline repricing (FR-16/TC-18)", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  const ts = Date.now();
  let tutorId: string;
  let studentA: { id: string };
  let studentB: { id: string };
  let studentC: { id: string };

  beforeAll(async () => {
    const tutor = await createPublishedTutor(
      `tutor.deadline.${ts}@cogito.test`,
      ts,
    );
    tutorId = tutor.tutorId;

    studentA = await createTestUser(`student.dl.a.${ts}@cogito.test`);
    await createTestWallet(studentA.id, 300);
    studentB = await createTestUser(`student.dl.b.${ts}@cogito.test`);
    await createTestWallet(studentB.id, 300);
    studentC = await createTestUser(`student.dl.c.${ts}@cogito.test`);
    await createTestWallet(studentC.id, 300);
  });

  test("partial group (3 of 5) at deadline reprices to awaiting_reconfirmation", async () => {
    // Size 5 per-student price from the seeded tutor profile is 30.
    const b = await seedPartialGroup({
      tutorId,
      confirmedUserIds: [studentA.id, studentB.id, studentC.id],
      targetGroupSize: 5,
      perStudent: 30,
    });

    const result = await services.booking.expireBookings();
    expect(result.expired).toBeGreaterThanOrEqual(1);
    expect(result.failed).toBe(0);

    const [row] = await db.select().from(booking).where(eq(booking.id, b.id));
    expect(row!.currentState).toBe(BOOKING_STATE.AWAITING_RECONFIRMATION);
    // Repriced to the size-3 rate: 3 × 40.
    expect(row!.holdAmount).toBe(120);
    const deadlineMs = new Date(row!.deadlineAt!).getTime();
    expect(deadlineMs).toBeGreaterThan(Date.now() + RESPONSE_WINDOW_MS - 5000);

    const participants = await db
      .select()
      .from(bookingParticipant)
      .where(eq(bookingParticipant.bookingId, b.id));
    for (const p of participants) {
      expect(p.heldAmount).toBe(40);
      expect(p.confirmationState).toBe("confirmed");
    }

    for (const id of [studentA.id, studentB.id, studentC.id]) {
      const w = await getWalletByUserId(id);
      expect(w!.heldBalance).toBe(40);

      const notifs = await db
        .select()
        .from(notification)
        .where(
          eq(notification.eventKey, `booking.${b.id}.deadline_reprice.${id}`),
        );
      expect(notifs.length).toBe(1);
      expect(notifs[0]!.severity).toBe("action");
    }
  });

  test("deadline with headcount < 2 still expires and releases all holds", async () => {
    const soloStudent = await createTestUser(
      `student.dl.under.${ts}@cogito.test`,
    );
    await createTestWallet(soloStudent.id, 300);
    const start = new Date(Date.now() + 48 * 3600_000);
    const b = await repo.insertBooking(db, {
      id: crypto.randomUUID(),
      type: BOOKING_TYPE.GROUP,
      modality: MODALITY.ONLINE,
      tutorId,
      proposerId: soloStudent.id,
      targetGroupSize: 5,
      minConfirmedHeadcount: 2,
      confirmedHeadcount: 1,
      currentState: BOOKING_STATE.AWAITING_PARTICIPANT_CONFIRMATION,
      scheduledStartAt: start,
      scheduledEndAt: new Date(start.getTime() + 3600_000),
      timezone: "Asia/Jakarta",
      priceSnapshot: {
        perStudent: 30,
        baseline: 150,
        tutorShare: 120,
        cogitoTake: 30,
      },
      originalMarks: 150,
      holdAmount: 30,
      deadlineAt: new Date(Date.now() - 60_000),
    });

    await repo.insertParticipant(db, {
      bookingId: b.id,
      userId: soloStudent.id,
      role: "proposer",
      confirmationState: "confirmed",
      heldAmount: 30,
    });
    await holdMarks(soloStudent.id, 30, b.id);

    const result = await services.booking.expireBookings();
    expect(result.failed).toBe(0);

    const [row] = await db.select().from(booking).where(eq(booking.id, b.id));
    expect(row!.currentState).toBe(BOOKING_STATE.EXPIRED);
    expect(row!.holdAmount).toBe(0);

    const w = await getWalletByUserId(soloStudent.id);
    expect(w!.heldBalance).toBe(0);
    expect(w!.availableBalance).toBe(300);
  });

  test("B5: partial group at deadline whose reprice fails (insufficient marks) falls back to EXPIRED instead of wedging", async () => {
    const a = await createTestUser(`student.dl.b5.a.${ts}@cogito.test`);
    await createTestWallet(a.id, 30);
    const c = await createTestUser(`student.dl.b5.c.${ts}@cogito.test`);
    await createTestWallet(c.id, 30);

    // 2-of-5 group, both students committed their entire balance to the
    // size-5 hold (30 each): repricing to the size-2 rate (45/student) needs
    // +15 available per student, which neither has — reprice must fail.
    const seeded = await seedPartialGroup({
      tutorId,
      confirmedUserIds: [a.id, c.id],
      targetGroupSize: 5,
      perStudent: 30,
    });

    const result = await services.booking.expireBookings();
    // The failure is handled inside the expiry job — no wedged booking left
    // to retry forever.
    expect(result.failed).toBe(0);

    const [row] = await db
      .select()
      .from(booking)
      .where(eq(booking.id, seeded.id));
    expect(row!.currentState).toBe(BOOKING_STATE.EXPIRED);
    expect(row!.holdAmount).toBe(0);

    for (const id of [a.id, c.id]) {
      const w = await getWalletByUserId(id);
      expect(w!.heldBalance).toBe(0);
      expect(w!.availableBalance).toBe(30);
    }
  });

  test("U3/B8: 3-of-5 group at its RECONFIRMATION deadline reprices again instead of expiring", async () => {
    const a = await createTestUser(`student.u3.a.${ts}@cogito.test`);
    await createTestWallet(a.id, 300);
    const b2 = await createTestUser(`student.u3.b.${ts}@cogito.test`);
    await createTestWallet(b2.id, 300);
    const c = await createTestUser(`student.u3.c.${ts}@cogito.test`);
    await createTestWallet(c.id, 300);

    // Already repriced once (3-of-5 at 40/student), now at its reconfirmation
    // deadline with the same valid partial headcount.
    const seeded = await seedPartialGroup({
      tutorId,
      confirmedUserIds: [a.id, b2.id, c.id],
      targetGroupSize: 5,
      perStudent: 40,
      state: BOOKING_STATE.AWAITING_RECONFIRMATION,
    });

    const result = await services.booking.expireBookings();
    expect(result.failed).toBe(0);

    const [row] = await db
      .select()
      .from(booking)
      .where(eq(booking.id, seeded.id));
    // Still awaiting reconfirmation with a fresh deadline — NOT expired.
    expect(row!.currentState).toBe(BOOKING_STATE.AWAITING_RECONFIRMATION);
    expect(row!.holdAmount).toBe(120);
    const deadlineMs = new Date(row!.deadlineAt!).getTime();
    expect(deadlineMs).toBeGreaterThan(Date.now() + RESPONSE_WINDOW_MS - 5000);

    for (const id of [a.id, b2.id, c.id]) {
      const w = await getWalletByUserId(id);
      expect(w!.heldBalance).toBe(40);

      const notifs = await db
        .select()
        .from(notification)
        .where(
          eq(
            notification.eventKey,
            `booking.${seeded.id}.deadline_reprice.${id}`,
          ),
        );
      expect(notifs.length).toBe(1);
    }
  });

  test("U3: 1-of-5 at reconfirmation deadline still expires and releases all holds", async () => {
    const solo = await createTestUser(`student.u3.under.${ts}@cogito.test`);
    await createTestWallet(solo.id, 100);

    const seeded = await seedPartialGroup({
      tutorId,
      confirmedUserIds: [solo.id],
      targetGroupSize: 5,
      perStudent: 40,
      state: BOOKING_STATE.AWAITING_RECONFIRMATION,
    });

    const result = await services.booking.expireBookings();
    expect(result.failed).toBe(0);

    const [row] = await db
      .select()
      .from(booking)
      .where(eq(booking.id, seeded.id));
    expect(row!.currentState).toBe(BOOKING_STATE.EXPIRED);
    expect(row!.holdAmount).toBe(0);

    const w = await getWalletByUserId(solo.id);
    expect(w!.heldBalance).toBe(0);
    expect(w!.availableBalance).toBe(100);
  });
});
