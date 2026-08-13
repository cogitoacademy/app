import { describe, test, expect, beforeAll } from "bun:test";
import { eq, and } from "drizzle-orm";
import { db } from "@cogito-app/db";
import {
  booking,
  ledgerEntry,
  notification,
  bookingStateHistory,
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
  ENTRY_TYPE,
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
      displayName: "Prof Expiry",
      token: `token-expiry-${ts}`,
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
    displayName: "Prof Expiry",
    shortBio: "Bio",
    credentialsSummary: "Creds",
    expertise: ["Mathematics"],
    modality: "both",
    prices: { "1": 50, "2": 45, "3": 40, "4": 35, "5": 30, "6": 28 },
    availabilitySummary: "Flexible",
    onboardingStatus: "published",
    publishedAt: new Date(),
  });

  const start = new Date(Date.now() + 24 * 3600_000);
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

async function seedExpiringBooking(params: {
  tutorId: string;
  proposerId: string;
  state: string;
  holdAmount: number;
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
    deadlineAt: new Date(Date.now() - 60_000),
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

describe("Scheduler: expireBookings against real Postgres", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  const ts = Date.now();
  let tutorId: string;
  let slotId: string;
  let studentA: { id: string };
  let studentB: { id: string };
  let soloBookingId: string;

  beforeAll(async () => {
    const tutor = await createPublishedTutor(
      `tutor.expiry.${ts}@cogito.test`,
      ts,
    );
    tutorId = tutor.tutorId;
    slotId = tutor.slotId;

    studentA = await createTestUser(`student.expiry.a.${ts}@cogito.test`);
    await createTestWallet(studentA.id, 200);

    studentB = await createTestUser(`student.expiry.b.${ts}@cogito.test`);
    await createTestWallet(studentB.id, 500);
  });

  test("seed: createSolo booking is expiry-eligible with a past deadline and a held hold", async () => {
    const start = new Date(Date.now() + 24 * 3600_000);
    const b = await services.booking.createSolo(studentA.id, {
      tutorId,
      availabilitySlotId: slotId,
      modality: "online",
      scheduledStartAt: start,
      scheduledEndAt: new Date(start.getTime() + 3600_000),
      timezone: "Asia/Jakarta",
    });
    soloBookingId = b.id;
    expect(b.currentState).toBe(BOOKING_STATE.AWAITING_TUTOR_REVIEW);
    expect(b.holdAmount).toBeGreaterThan(0);

    await db
      .update(booking)
      .set({ deadlineAt: new Date(Date.now() - 60_000) })
      .where(eq(booking.id, b.id));

    const [row] = await db.select().from(booking).where(eq(booking.id, b.id));
    expect(new Date(row!.deadlineAt!).getTime()).toBeLessThan(Date.now());

    const w = await getWalletByUserId(studentA.id);
    expect(w!.heldBalance).toBeGreaterThan(0);

    const holds = await db
      .select()
      .from(ledgerEntry)
      .where(
        and(
          eq(ledgerEntry.bookingId, b.id),
          eq(ledgerEntry.entryType, ENTRY_TYPE.HOLD),
        ),
      );
    expect(holds.length).toBe(1);
  });

  test("expireBookings expires an eligible booking, releases the hold, and records state history", async () => {
    const result = await services.booking.expireBookings();
    expect(result.expired).toBe(1);
    expect(result.failed).toBe(0);

    const [b] = await db
      .select()
      .from(booking)
      .where(eq(booking.id, soloBookingId));
    expect(b!.currentState).toBe(BOOKING_STATE.EXPIRED);
    expect(b!.holdAmount).toBe(0);

    const w = await getWalletByUserId(studentA.id);
    expect(w!.heldBalance).toBe(0);
    expect(w!.availableBalance).toBe(200);

    const releases = await db
      .select()
      .from(ledgerEntry)
      .where(
        and(
          eq(ledgerEntry.bookingId, soloBookingId),
          eq(ledgerEntry.entryType, ENTRY_TYPE.RELEASE),
        ),
      );
    expect(releases.length).toBe(1);

    const history = await db
      .select()
      .from(bookingStateHistory)
      .where(
        and(
          eq(bookingStateHistory.bookingId, soloBookingId),
          eq(bookingStateHistory.toState, BOOKING_STATE.EXPIRED),
        ),
      );
    expect(history.length).toBe(1);
    expect(history[0]!.actorType).toBe(ACTOR_TYPE.SYSTEM);
    expect(history[0]!.actorId).toBeNull();
  });

  test("every eligible state transitions to its expiry target (mapping applied)", async () => {
    const cases = [
      {
        state: BOOKING_STATE.SCHEDULED,
        target: BOOKING_STATE.NO_SHOW,
        holdAmount: 40,
      },
      {
        state: BOOKING_STATE.AWAITING_PARTICIPANT_CONFIRMATION,
        target: BOOKING_STATE.EXPIRED,
        holdAmount: 50,
      },
      {
        state: BOOKING_STATE.AWAITING_RECONFIRMATION,
        target: BOOKING_STATE.EXPIRED,
        holdAmount: 60,
      },
      {
        state: BOOKING_STATE.RESCHEDULE_PROPOSED,
        target: BOOKING_STATE.EXPIRED,
        holdAmount: 70,
      },
      {
        state: BOOKING_STATE.AWAITING_ADMIN_ROOM_APPROVAL,
        target: BOOKING_STATE.CANCELLED,
        holdAmount: 80,
      },
    ];
    const ids: string[] = [];
    for (const c of cases) {
      const b = await seedExpiringBooking({
        tutorId,
        proposerId: studentB.id,
        state: c.state,
        holdAmount: c.holdAmount,
      });
      ids.push(b.id);
    }

    const result = await services.booking.expireBookings();
    expect(result.expired).toBeGreaterThanOrEqual(5);
    expect(result.failed).toBe(0);

    for (const c of cases) {
      const id = ids[cases.indexOf(c)]!;
      const [row] = await db.select().from(booking).where(eq(booking.id, id));
      expect(row!.currentState).toBe(c.target);
      expect(row!.holdAmount).toBe(0);
    }

    const wB = await getWalletByUserId(studentB.id);
    expect(wB!.heldBalance).toBe(0);
    expect(wB!.availableBalance).toBe(500);
  });

  test("differential: releaseExpiredHolds is a no-op once expireBookings released the holds", async () => {
    const result = await services.booking.releaseExpiredHolds();
    expect(result.released).toBe(0);

    const wA = await getWalletByUserId(studentA.id);
    expect(wA!.heldBalance).toBe(0);
    expect(wA!.availableBalance).toBe(200);

    const wB = await getWalletByUserId(studentB.id);
    expect(wB!.heldBalance).toBe(0);
    expect(wB!.availableBalance).toBe(500);

    const releases = await db
      .select()
      .from(ledgerEntry)
      .where(eq(ledgerEntry.entryType, ENTRY_TYPE.RELEASE));
    expect(releases.some((r) => r.bookingId === soloBookingId)).toBe(true);

    const [solo] = await db
      .select()
      .from(booking)
      .where(eq(booking.id, soloBookingId));
    expect(solo!.currentState).toBe(BOOKING_STATE.EXPIRED);
  });

  test("expiry emits a notification for the affected user (G2)", async () => {
    const notifs = await db
      .select()
      .from(notification)
      .where(eq(notification.bookingId, soloBookingId));
    const expiryNotifs = notifs.filter((n) =>
      /expir/i.test(`${n.title} ${n.body}`),
    );
    expect(expiryNotifs.length).toBeGreaterThan(0);
  });
});

describe("Scheduler: expireBookings candidate selection", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  const ts = Date.now() + 1000;
  let tutorId: string;
  let studentId: string;

  beforeAll(async () => {
    const tutor = await createPublishedTutor(
      `tutor.expiry.skip.${ts}@cogito.test`,
      ts,
    );
    tutorId = tutor.tutorId;
    const student = await createTestUser(
      `student.expiry.skip.${ts}@cogito.test`,
    );
    studentId = student.id;
    await createTestWallet(student.id, 200);
  });

  test("terminal and future-deadline bookings are not selected as candidates", async () => {
    const start = new Date(Date.now() + 48 * 3600_000);
    await repo.insertBooking(db, {
      id: crypto.randomUUID(),
      type: BOOKING_TYPE.SOLO,
      modality: MODALITY.ONLINE,
      tutorId,
      proposerId: studentId,
      targetGroupSize: 1,
      minConfirmedHeadcount: 1,
      confirmedHeadcount: 1,
      currentState: BOOKING_STATE.EXPIRED,
      scheduledStartAt: start,
      scheduledEndAt: new Date(start.getTime() + 3600_000),
      timezone: "Asia/Jakarta",
      originalMarks: 42,
      holdAmount: 42,
      deadlineAt: new Date(Date.now() - 60_000),
    });

    await repo.insertBooking(db, {
      id: crypto.randomUUID(),
      type: BOOKING_TYPE.SOLO,
      modality: MODALITY.ONLINE,
      tutorId,
      proposerId: studentId,
      targetGroupSize: 1,
      minConfirmedHeadcount: 1,
      confirmedHeadcount: 1,
      currentState: BOOKING_STATE.AWAITING_TUTOR_REVIEW,
      scheduledStartAt: start,
      scheduledEndAt: new Date(start.getTime() + 3600_000),
      timezone: "Asia/Jakarta",
      originalMarks: 42,
      holdAmount: 42,
      deadlineAt: new Date(Date.now() + RESPONSE_WINDOW_MS),
    });

    const result = await services.booking.expireBookings();
    expect(result.expired).toBe(0);
    expect(result.failed).toBe(0);

    const rows = await db.select().from(booking);
    expect(rows.every((r) => r.holdAmount === 42)).toBe(true);
  });
});
