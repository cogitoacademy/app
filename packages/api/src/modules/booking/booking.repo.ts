import { eq, and, gte, desc, inArray, ne, lte, sql } from "drizzle-orm";
import {
  booking,
  bookingParticipant,
  bookingStateHistory,
  bookingRescheduleProposal,
  bookingSession,
  availabilitySlot,
  tutorProfile,
  type booking as bookingTable,
} from "@cogito-app/db/schema";
import type { DbType } from "../../lib/db";
import type { DbOrTx } from "../../lib/tx";
import { CONFIRMATION_STATE, ONBOARDING_STATUS } from "../../shared/constants";
import { BOOKING_STATES } from "./booking-state.types";

type BookingRow = typeof bookingTable.$inferSelect;

export async function findBookingById(
  conn: DbOrTx,
  bookingId: string,
): Promise<BookingRow | null> {
  const [b] = await conn
    .select()
    .from(booking)
    .where(eq(booking.id, bookingId))
    .limit(1);
  return (b as BookingRow | undefined) ?? null;
}

export async function findTutorProfile(
  conn: DbOrTx,
  tutorId: string,
): Promise<typeof tutorProfile.$inferSelect | null> {
  return (
    (await conn.query.tutorProfile.findFirst({
      where: and(
        eq(tutorProfile.userId, tutorId),
        eq(tutorProfile.onboardingStatus, ONBOARDING_STATUS.PUBLISHED),
      ),
    })) ?? null
  );
}

export async function findAvailabilitySlot(
  conn: DbOrTx,
  slotId: string,
  tutorId: string,
  opts?: { futureOnly?: boolean },
) {
  const conditions = [
    eq(availabilitySlot.id, slotId),
    eq(availabilitySlot.tutorId, tutorId),
    eq(availabilitySlot.isActive, true),
  ];
  if (opts?.futureOnly) {
    conditions.push(gte(availabilitySlot.startDate, new Date()));
  }
  return conn.query.availabilitySlot.findFirst({
    where: and(...conditions),
  });
}

export async function findParticipant(
  conn: DbOrTx,
  bookingId: string,
  userId: string,
) {
  const [participant] = await conn
    .select()
    .from(bookingParticipant)
    .where(
      and(
        eq(bookingParticipant.bookingId, bookingId),
        eq(bookingParticipant.userId, userId),
      ),
    )
    .limit(1);
  return participant ?? null;
}

export async function findConfirmedParticipants(
  conn: DbOrTx,
  bookingId: string,
  excludeUserId?: string,
) {
  const conditions = [
    eq(bookingParticipant.bookingId, bookingId),
    inArray(bookingParticipant.confirmationState, [
      CONFIRMATION_STATE.CONFIRMED,
      CONFIRMATION_STATE.RECONFIRMED,
    ]),
  ];
  if (excludeUserId) {
    conditions.push(ne(bookingParticipant.userId, excludeUserId));
  }
  return conn
    .select()
    .from(bookingParticipant)
    .where(and(...conditions));
}

export async function findReconfirmedParticipants(
  conn: DbOrTx,
  bookingId: string,
) {
  return conn
    .select()
    .from(bookingParticipant)
    .where(
      and(
        eq(bookingParticipant.bookingId, bookingId),
        eq(
          bookingParticipant.confirmationState,
          CONFIRMATION_STATE.RECONFIRMED,
        ),
      ),
    );
}

export async function insertBooking(
  conn: DbOrTx,
  values: typeof booking.$inferInsert,
) {
  const [b] = await conn.insert(booking).values(values).returning();
  return b!;
}

export async function updateBookingState(
  conn: DbOrTx,
  bookingId: string,
  state: string,
  previousState: string | null,
  reason?: string | null,
) {
  const [updated] = await conn
    .update(booking)
    .set({
      currentState: state,
      previousState,
      stateReason: reason ?? undefined,
      updatedAt: new Date(),
    })
    .where(eq(booking.id, bookingId))
    .returning();
  return updated!;
}

export async function updateBookingCancellationReason(
  conn: DbOrTx,
  bookingId: string,
  reason: string | null,
) {
  await conn
    .update(booking)
    .set({ cancellationReason: reason })
    .where(eq(booking.id, bookingId));
}

export async function updateBookingHoldAmount(
  conn: DbOrTx,
  bookingId: string,
  holdAmount: number,
) {
  await conn
    .update(booking)
    .set({ holdAmount })
    .where(eq(booking.id, bookingId));
}

export async function updateBookingConfirmedHeadcount(
  conn: DbOrTx,
  bookingId: string,
  confirmedHeadcount: number,
) {
  await conn
    .update(booking)
    .set({ confirmedHeadcount })
    .where(eq(booking.id, bookingId));
}

export async function insertParticipant(
  conn: DbOrTx,
  values: typeof bookingParticipant.$inferInsert,
) {
  await conn.insert(bookingParticipant).values(values);
}

export async function updateParticipantState(
  conn: DbOrTx,
  participantId: string,
  values: Partial<typeof bookingParticipant.$inferInsert>,
) {
  await conn
    .update(bookingParticipant)
    .set(values)
    .where(eq(bookingParticipant.id, participantId));
}

export async function insertStateHistory(
  conn: DbOrTx,
  entry: {
    bookingId: string;
    fromState: string | null;
    toState: string;
    reason?: string | null;
    actorId: string;
    actorType: string;
    metadata?: Record<string, unknown>;
  },
) {
  await conn.insert(bookingStateHistory).values({
    bookingId: entry.bookingId,
    fromState: entry.fromState,
    toState: entry.toState,
    reason: entry.reason ?? null,
    actorId: entry.actorId,
    actorType: entry.actorType,
    metadata: entry.metadata ?? {},
  });
}

export async function insertRescheduleProposal(
  conn: DbOrTx,
  values: {
    bookingId: string;
    proposedBy: string;
    proposedStartAt: Date;
    proposedEndAt: Date;
    status: string;
  },
) {
  await conn.insert(bookingRescheduleProposal).values(values);
}

export async function insertBookingSession(
  conn: DbOrTx,
  values: {
    seriesBookingId: string;
    scheduledStartAt: Date;
    scheduledEndAt: Date;
    currentState: string;
    holdAmount: number;
    priceSnapshot: {
      perStudent: number;
      baseline: number;
      tutorShare: number;
      cogitoTake: number;
    };
  },
) {
  await conn.insert(bookingSession).values(values);
}

export async function listSessionsBySeriesId(
  conn: DbOrTx,
  seriesBookingId: string,
) {
  return conn
    .select()
    .from(bookingSession)
    .where(eq(bookingSession.seriesBookingId, seriesBookingId))
    .orderBy(bookingSession.scheduledStartAt);
}

export async function findOverlappingBookings(
  conn: DbOrTx,
  tutorId: string,
  startAt: Date,
  endAt: Date,
  excludeBookingId?: string,
) {
  const activeStates = BOOKING_STATES.filter(
    (s) =>
      ![
        "declined",
        "cancelled",
        "late_cancelled",
        "no_show",
        "expired",
        "completed",
      ].includes(s),
  );
  const conditions = [
    eq(booking.tutorId, tutorId),
    inArray(booking.currentState, activeStates),
    lte(booking.scheduledStartAt, endAt),
    gte(booking.scheduledEndAt, startAt),
  ];
  if (excludeBookingId) {
    conditions.push(ne(booking.id, excludeBookingId));
  }
  return conn
    .select({ id: booking.id })
    .from(booking)
    .where(and(...conditions))
    .limit(1);
}

export async function findBookingsExpiringByDeadline(
  conn: DbOrTx,
  states: string[],
) {
  return conn
    .select()
    .from(booking)
    .where(
      and(
        lte(booking.deadlineAt, new Date()),
        inArray(booking.currentState, states),
      ),
    );
}

export async function findBookingType(
  conn: DbOrTx,
  bookingId: string,
): Promise<string | null> {
  const [b] = await conn
    .select({ type: booking.type })
    .from(booking)
    .where(eq(booking.id, bookingId))
    .limit(1);
  return b?.type ?? null;
}

export async function updateBookingVersioned(
  conn: DbOrTx,
  bookingId: string,
  expectedVersion: number,
  updates: Partial<
    Pick<
      typeof bookingTable.$inferInsert,
      | "currentState"
      | "previousState"
      | "stateReason"
      | "cancellationReason"
      | "holdAmount"
      | "confirmedHeadcount"
      | "overrideMeta"
    >
  >,
): Promise<{
  updated: typeof bookingTable.$inferSelect;
  newVersion: number;
} | null> {
  const result = await conn
    .update(booking)
    .set({
      ...updates,
      version: sql`${booking.version} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(booking.id, bookingId), eq(booking.version, expectedVersion)))
    .returning();

  if (!result.length) return null;
  const updated = result[0]!;
  return {
    updated: updated as typeof bookingTable.$inferSelect,
    newVersion: expectedVersion + 1,
  };
}

export function createBookingRepo(db: DbType) {
  async function findBookingWithParticipants(bookingId: string) {
    return db.query.booking.findFirst({
      where: eq(booking.id, bookingId),
      with: {
        participants: { with: { user: true } },
        stateHistory: true,
        meeting: true,
        roomBookings: { with: { room: true } },
      },
    });
  }

  async function listBookingsByProposer(
    proposerId: string,
    opts: { states?: string[]; limit: number },
  ) {
    const conditions = [eq(booking.proposerId, proposerId)];
    if (opts.states?.length) {
      conditions.push(inArray(booking.currentState, opts.states));
    }
    return db.query.booking.findMany({
      where: and(...conditions),
      orderBy: [desc(booking.scheduledStartAt)],
      limit: opts.limit + 1,
      with: { participants: { with: { user: true } } },
    });
  }

  return {
    findBookingById,
    findBookingWithParticipants,
    listBookingsByProposer,
    findTutorProfile,
    findAvailabilitySlot,
    findParticipant,
    findConfirmedParticipants,
    findReconfirmedParticipants,
    insertBooking,
    updateBookingState,
    updateBookingCancellationReason,
    updateBookingHoldAmount,
    updateBookingConfirmedHeadcount,
    insertParticipant,
    updateParticipantState,
    insertStateHistory,
    insertRescheduleProposal,
    insertBookingSession,
    listSessionsBySeriesId,
    findBookingsExpiringByDeadline,
    findBookingType,
    findOverlappingBookings,
    updateBookingVersioned,
  };
}

export type BookingRepo = ReturnType<typeof createBookingRepo>;
