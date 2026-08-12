import { describe, test, expect, beforeAll } from "bun:test";
import { eq, and, inArray } from "drizzle-orm";
import { db } from "@cogito-app/db";
import {
  booking,
  ledgerEntry,
  bookingParticipant,
  bookingStateHistory,
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
  ENTRY_TYPE,
  RESPONSE_WINDOW_MS,
} from "../../shared/constants";
import { BOOKING_STATE } from "../../modules/booking/booking-state.types";

const repo = createBookingRepo(db);

async function seedBookingWithHold(params: {
  tutorId: string;
  proposerId: string;
  state: string;
  holdAmount: number;
  deadlineOffsetMs: number;
}) {
  const start = new Date(Date.now() + 48 * 3600_000);
  const b = await repo.insertBooking(db, {
    id: crypto.randomUUID(),
    type: BOOKING_TYPE.SOLO,
    modality: MODALITY.ONLINE,
    tutorId: params.tutorId,
    proposerId: params.proposerId,
    targetGroupSize: 1,
    minConfirmedHeadcount: 1,
    confirmedHeadcount: 1,
    currentState: params.state,
    scheduledStartAt: start,
    scheduledEndAt: new Date(start.getTime() + 3600_000),
    timezone: "Asia/Jakarta",
    priceSnapshot: {
      perStudent: params.holdAmount,
      baseline: params.holdAmount,
      tutorShare: params.holdAmount * 0.8,
      cogitoTake: params.holdAmount * 0.2,
    },
    originalMarks: params.holdAmount,
    holdAmount: params.holdAmount,
    deadlineAt: new Date(Date.now() + params.deadlineOffsetMs),
  });

  await repo.insertParticipant(db, {
    bookingId: b.id,
    userId: params.proposerId,
    role: "proposer",
    confirmationState: "confirmed",
    heldAmount: params.holdAmount,
  });

  const w = await getWalletByUserId(params.proposerId);
  if (!w) throw new Error(`wallet missing for ${params.proposerId}`);
  await services.wallet.hold(db, {
    walletId: w.id,
    amount: params.holdAmount,
    eventKey: `booking.${b.id}.hold`,
    sourceReference: b.id,
    bookingId: b.id,
    actorType: ACTOR_TYPE.STUDENT,
    reason: "Hold Marks for seeded booking",
  });

  return b;
}

describe("Scheduler: releaseExpiredHolds (real DB)", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  const ts = Date.now();
  let tutorId: string;
  let studentId: string;
  let expiredAId: string;
  let expiredBId: string;
  let futureId: string;

  beforeAll(async () => {
    const tutor = await createTestUser(
      `tutor.holds.${ts}@cogito.test`,
      "tutor",
    );
    tutorId = tutor.id;
    const student = await createTestUser(`student.holds.${ts}@cogito.test`);
    studentId = student.id;
    await createTestWallet(student.id, 300);
  });

  test("seed: two overdue holdings and one in-window control", async () => {
    const a = await seedBookingWithHold({
      tutorId,
      proposerId: studentId,
      state: BOOKING_STATE.AWAITING_TUTOR_REVIEW,
      holdAmount: 42,
      deadlineOffsetMs: -60_000,
    });
    expiredAId = a.id;

    const b = await seedBookingWithHold({
      tutorId,
      proposerId: studentId,
      state: BOOKING_STATE.AWAITING_PARTICIPANT_CONFIRMATION,
      holdAmount: 100,
      deadlineOffsetMs: -2 * 60_000,
    });
    expiredBId = b.id;

    const c = await seedBookingWithHold({
      tutorId,
      proposerId: studentId,
      state: BOOKING_STATE.AWAITING_TUTOR_REVIEW,
      holdAmount: 50,
      deadlineOffsetMs: RESPONSE_WINDOW_MS,
    });
    futureId = c.id;

    const w = await getWalletByUserId(studentId);
    expect(w!.heldBalance).toBe(192);
    expect(w!.availableBalance).toBe(108);
  });

  test("releaseExpiredHolds releases only past-deadline holds", async () => {
    const result = await services.booking.releaseExpiredHolds();
    expect(result.released).toBe(2);

    const rows = await db
      .select()
      .from(booking)
      .where(inArray(booking.id, [expiredAId, expiredBId, futureId]));

    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(expiredAId)!.holdAmount).toBe(0);
    expect(byId.get(expiredAId)!.currentState).toBe(
      BOOKING_STATE.AWAITING_TUTOR_REVIEW,
    );
    expect(byId.get(expiredBId)!.holdAmount).toBe(0);
    expect(byId.get(futureId)!.holdAmount).toBe(50);
    expect(byId.get(futureId)!.currentState).toBe(
      BOOKING_STATE.AWAITING_TUTOR_REVIEW,
    );
  });

  test("wallet shows held reduced and available restored", async () => {
    const w = await getWalletByUserId(studentId);
    expect(w!.heldBalance).toBe(50);
    expect(w!.availableBalance).toBe(250);
    expect(w!.totalBalance).toBe(300);
  });

  test("release ledger entries recorded for the released bookings", async () => {
    const entries = await db
      .select()
      .from(ledgerEntry)
      .where(
        and(
          inArray(ledgerEntry.bookingId, [expiredAId, expiredBId, futureId]),
          eq(ledgerEntry.entryType, ENTRY_TYPE.RELEASE),
        ),
      );
    const bookingIds = new Set(entries.map((e) => e.bookingId));
    expect(bookingIds.has(expiredAId)).toBe(true);
    expect(bookingIds.has(expiredBId)).toBe(true);
    expect(bookingIds.has(futureId)).toBe(false);
    for (const entry of entries) {
      expect(entry.actorType).toBe(ACTOR_TYPE.SYSTEM);
      expect(entry.amount).toBeGreaterThan(0);
    }
  });

  test("participants of released bookings are marked withdrawn_pre_h2", async () => {
    const participants = await db
      .select()
      .from(bookingParticipant)
      .where(
        and(
          inArray(bookingParticipant.bookingId, [
            expiredAId,
            expiredBId,
            futureId,
          ]),
          eq(bookingParticipant.userId, studentId),
        ),
      );
    const byBooking = new Map(participants.map((p) => [p.bookingId, p]));
    expect(byBooking.get(expiredAId)!.confirmationState).toBe(
      "withdrawn_pre_h2",
    );
    expect(byBooking.get(expiredAId)!.withdrawnReason).toBe(
      "Hold released: deadline passed",
    );
    expect(byBooking.get(expiredAId)!.withdrawnAt).not.toBeNull();
    expect(byBooking.get(expiredBId)!.confirmationState).toBe(
      "withdrawn_pre_h2",
    );
    expect(byBooking.get(futureId)!.confirmationState).toBe("confirmed");
    expect(byBooking.get(futureId)!.heldAmount).toBe(50);
  });

  test("N3 pin: participant.heldAmount is left stale after the wallet release", async () => {
    const participants = await db
      .select()
      .from(bookingParticipant)
      .where(
        and(
          inArray(bookingParticipant.bookingId, [expiredAId, expiredBId]),
          eq(bookingParticipant.userId, studentId),
        ),
      );
    const byBooking = new Map(participants.map((p) => [p.bookingId, p]));
    expect(byBooking.get(expiredAId)!.heldAmount).toBe(42);
    expect(byBooking.get(expiredBId)!.heldAmount).toBe(100);
  });

  test("booking state is left untouched (holds-only sweeper)", async () => {
    const [a] = await db
      .select()
      .from(booking)
      .where(eq(booking.id, expiredAId));
    expect(a!.currentState).toBe(BOOKING_STATE.AWAITING_TUTOR_REVIEW);
    expect(a!.stateReason).toBeNull();

    const history = await db
      .select()
      .from(bookingStateHistory)
      .where(eq(bookingStateHistory.bookingId, expiredAId));
    expect(history.length).toBe(0);
  });

  test("re-running releaseExpiredHolds is a no-op", async () => {
    const result = await services.booking.releaseExpiredHolds();
    expect(result.released).toBe(0);
  });
});
