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

async function createPublishedTutor(
  email: string,
  ts: number,
  prices: Record<string, number> = {
    "1": 50,
    "2": 45,
    "3": 40,
    "4": 35,
    "5": 30,
    "6": 28,
  },
  tokenSuffix = ts,
) {
  const tutor = await createTestUser(email, "tutor");

  const [invite] = await db
    .insert(tutorInvite)
    .values({
      email,
      displayName: "Prof Deadline",
      token: `token-deadline-${tokenSuffix}`,
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
    prices,
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

  test("F3: headcount change during reconfirmation re-issues reconfirmation instead of finalizing at a stale price", async () => {
    const a = await createTestUser(`student.f3.a.${ts}@cogito.test`);
    await createTestWallet(a.id, 300);
    const b2 = await createTestUser(`student.f3.b.${ts}@cogito.test`);
    await createTestWallet(b2.id, 300);
    const c = await createTestUser(`student.f3.c.${ts}@cogito.test`);
    await createTestWallet(c.id, 300);

    // 3-of-5 group already repriced at the size-3 rate (40/student), sitting
    // in its reconfirmation window.
    const seeded = await seedPartialGroup({
      tutorId,
      confirmedUserIds: [a.id, b2.id, c.id],
      targetGroupSize: 5,
      perStudent: 40,
      state: BOOKING_STATE.AWAITING_RECONFIRMATION,
    });

    // Two of three reconfirm at the 40/student rate.
    await services.booking.reconfirm(a.id, seeded.id, true);
    await services.booking.reconfirm(b2.id, seeded.id, true);

    // The third withdraws mid-cycle: headcount drops to 2, but the pricing
    // snapshot is still the size-3 one (withdraw from awaiting_reconfirmation
    // does not reprice).
    await services.booking.withdraw(c.id, seeded.id, "schedule conflict");

    // The last survivor's accept must NOT finalize to tutor review on the
    // stale size-3 price — it re-enters a fresh reconfirmation cycle repriced
    // for the new headcount.
    const result = await services.booking.reconfirm(b2.id, seeded.id, true);
    expect(result.reconfirmed).toBe(true);

    const [row] = await db
      .select()
      .from(booking)
      .where(eq(booking.id, seeded.id));
    expect(row!.currentState).toBe(BOOKING_STATE.AWAITING_RECONFIRMATION);
    // Repriced to the size-2 rate: 2 × 45.
    expect(row!.priceSnapshot?.perStudent).toBe(45);
    expect(row!.holdAmount).toBe(90);
    const deadlineMs = new Date(row!.deadlineAt!).getTime();
    expect(deadlineMs).toBeGreaterThan(Date.now() + RESPONSE_WINDOW_MS - 5000);

    // Every survivor must reconfirm again at the new rate — no one stays
    // RECONFIRMED from the stale-price round.
    const participants = await db
      .select()
      .from(bookingParticipant)
      .where(eq(bookingParticipant.bookingId, seeded.id));
    const survivors = participants.filter((p) =>
      [a.id, b2.id].includes(p.userId),
    );
    expect(survivors.length).toBe(2);
    for (const p of survivors) {
      expect(p.confirmationState).toBe("confirmed");
      expect(p.heldAmount).toBe(45);
    }

    // After the re-issued cycle, reconfirming both finalizes at the new price.
    await services.booking.reconfirm(a.id, seeded.id, true);
    await services.booking.reconfirm(b2.id, seeded.id, true);
    const [finalRow] = await db
      .select()
      .from(booking)
      .where(eq(booking.id, seeded.id));
    expect(finalRow!.currentState).toBe(BOOKING_STATE.AWAITING_TUTOR_REVIEW);
    expect(finalRow!.holdAmount).toBe(90);
  });

  test("N1: flat legacy price map (equal per-student at sizes 2 and 3) does not loop the F3 reissue", async () => {
    // Flat legacy price map: per-student is 40 at every group size. When the
    // headcount drops 3 → 2, repriceGroupForHeadcount early-returns because
    // the per-student price is unchanged — without the holdAmount sync the
    // F3 branch would re-fire on every reconfirm accept, looping the booking
    // forever without ever reaching AWAITING_TUTOR_REVIEW.
    const flatTutor = await createPublishedTutor(
      `tutor.n1.${ts}@cogito.test`,
      ts,
      { "1": 50, "2": 40, "3": 40, "4": 40, "5": 40, "6": 40 },
      `${ts}-n1`,
    );

    const a = await createTestUser(`student.n1.a.${ts}@cogito.test`);
    await createTestWallet(a.id, 300);
    const b2 = await createTestUser(`student.n1.b.${ts}@cogito.test`);
    await createTestWallet(b2.id, 300);
    const c = await createTestUser(`student.n1.c.${ts}@cogito.test`);
    await createTestWallet(c.id, 300);

    // 3-of-3 group at the size-3 rate (40/student) sitting in its
    // reconfirmation window.
    const seeded = await seedPartialGroup({
      tutorId: flatTutor.tutorId,
      confirmedUserIds: [a.id, b2.id, c.id],
      targetGroupSize: 3,
      perStudent: 40,
      state: BOOKING_STATE.AWAITING_RECONFIRMATION,
    });

    // Push the session beyond the H-2 cutoff so the mid-cycle withdrawal is
    // pre-H2 (regression to reconfirmation, not late-cancel).
    await db
      .update(booking)
      .set({
        scheduledStartAt: new Date(Date.now() + 6 * 3600_000),
        scheduledEndAt: new Date(Date.now() + 7 * 3600_000),
      })
      .where(eq(booking.id, seeded.id));

    // One participant withdraws mid-cycle: headcount 3 → 2. The flat map
    // keeps the per-student price at 40, so the reprice early-returns — the
    // pre-fix bug left holdAmount at the stale 3 × 40 = 120.
    await services.booking.withdraw(c.id, seeded.id, "schedule conflict");

    // Every subsequent accept must converge: the first re-issues (F3), the
    // reprice syncs holdAmount to the actual participant-held total (80),
    // and the final round of accepts finalizes the booking.
    await services.booking.reconfirm(a.id, seeded.id, true);
    await services.booking.reconfirm(b2.id, seeded.id, true);
    const result = await services.booking.reconfirm(a.id, seeded.id, true);
    expect(result.reconfirmed).toBe(true);

    const [row] = await db
      .select()
      .from(booking)
      .where(eq(booking.id, seeded.id));
    expect(row!.currentState).toBe(BOOKING_STATE.AWAITING_TUTOR_REVIEW);
    expect(row!.holdAmount).toBe(80);

    const participants = await db
      .select()
      .from(bookingParticipant)
      .where(eq(bookingParticipant.bookingId, seeded.id));
    const survivors = participants.filter((p) => [a.id, b2.id].includes(p.userId));
    expect(survivors.length).toBe(2);
    for (const p of survivors) {
      expect(p.confirmationState).toBe("reconfirmed");
      expect(p.heldAmount).toBe(40);
    }
  });

  test("F8: the tutor attendance row does not inflate the repricing headcount", async () => {
    const a = await createTestUser(`student.f8.a.${ts}@cogito.test`);
    await createTestWallet(a.id, 300);
    const b2 = await createTestUser(`student.f8.b.${ts}@cogito.test`);
    await createTestWallet(b2.id, 300);
    const c = await createTestUser(`student.f8.c.${ts}@cogito.test`);
    await createTestWallet(c.id, 300);

    // 3-of-5 group repriced at the size-3 rate (40/student).
    const seeded = await seedPartialGroup({
      tutorId,
      confirmedUserIds: [a.id, b2.id, c.id],
      targetGroupSize: 5,
      perStudent: 40,
    });

    // Tutor marks attendance: inserts a CONFIRMED participant row with
    // role='tutor' — it must not count as a fourth student in the headcount.
    await repo.insertParticipant(db, {
      bookingId: seeded.id,
      userId: tutorId,
      role: "tutor",
      confirmationState: "confirmed",
      heldAmount: 0,
      attendanceState: "present",
    });

    // Student A withdraws pre-H2 (the seeded session starts 1h out, which
    // would count as a late withdrawal — push it beyond the 2h cutoff first):
    // the group reprices to 2 students (not 3 — the tutor row must be
    // excluded).
    await db
      .update(booking)
      .set({
        scheduledStartAt: new Date(Date.now() + 6 * 3600_000),
        scheduledEndAt: new Date(Date.now() + 7 * 3600_000),
      })
      .where(eq(booking.id, seeded.id));
    await services.booking.withdraw(a.id, seeded.id, "schedule conflict");

    const [row] = await db
      .select()
      .from(booking)
      .where(eq(booking.id, seeded.id));
    expect(row!.currentState).toBe(BOOKING_STATE.AWAITING_RECONFIRMATION);
    // Repriced for 2 students at the size-2 rate (45), not 3 students (40).
    expect(row!.priceSnapshot?.perStudent).toBe(45);
    expect(row!.holdAmount).toBe(90);
  });
});
