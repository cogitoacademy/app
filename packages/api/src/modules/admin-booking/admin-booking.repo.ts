import { eq, asc, inArray, gt, and, sql } from "drizzle-orm";
import {
  booking,
  bookingStateHistory,
  bookingParticipant,
  paymentRecord,
} from "@cogito-app/db/schema";
import { BOOKING_STATE, TERMINAL_STATES } from "../booking/booking-state.types";
import { RESPONSE_WINDOW_MS } from "../../shared/constants";
import type { DbOrTx } from "../../lib/tx";

export type AdminBookingRepo = ReturnType<typeof createAdminBookingRepo>;

export type UrgencyLevel = "high" | "medium" | "low";

/**
 * Urgency bands used to sort the admin override queue.
 * Band 0 (pending action) first, band 1 (scheduled/confirmed) second,
 * band 2 (terminal) last. Within a band, bookings are ordered by
 * scheduledStartAt ascending (soonest first).
 */
export const URGENCY_BANDS: Record<UrgencyLevel, readonly string[]> = {
  high: [
    BOOKING_STATE.AWAITING_TUTOR_REVIEW,
    BOOKING_STATE.AWAITING_PARTICIPANT_CONFIRMATION,
    BOOKING_STATE.AWAITING_RECONFIRMATION,
    BOOKING_STATE.RESCHEDULE_PROPOSED,
    BOOKING_STATE.AWAITING_ADMIN_ROOM_APPROVAL,
  ],
  medium: [BOOKING_STATE.CONFIRMED, BOOKING_STATE.SCHEDULED],
  low: [...TERMINAL_STATES],
};

/**
 * State -> urgency rank lookup used to build the composite queue cursor.
 * Any state not listed here falls back to rank 2 (terminal).
 * Keep in sync with URGENCY_RANK_EXPR.
 */
export const URGENCY_RANK: Record<string, number> = {
  [BOOKING_STATE.AWAITING_TUTOR_REVIEW]: 0,
  [BOOKING_STATE.AWAITING_PARTICIPANT_CONFIRMATION]: 0,
  [BOOKING_STATE.AWAITING_RECONFIRMATION]: 0,
  [BOOKING_STATE.RESCHEDULE_PROPOSED]: 0,
  [BOOKING_STATE.AWAITING_ADMIN_ROOM_APPROVAL]: 0,
  [BOOKING_STATE.CONFIRMED]: 1,
  [BOOKING_STATE.SCHEDULED]: 1,
};

const URGENCY_RANK_EXPR = sql`CASE ${booking.currentState}
  WHEN 'awaiting_tutor_review' THEN 0
  WHEN 'awaiting_participant_confirmation' THEN 0
  WHEN 'awaiting_reconfirmation' THEN 0
  WHEN 'reschedule_proposed' THEN 0
  WHEN 'awaiting_admin_room_approval' THEN 0
  WHEN 'confirmed' THEN 1
  WHEN 'scheduled' THEN 1
  ELSE 2
END`;

export interface ListOverridesQueryOptions {
  /** Matches booking.override_meta.category. */
  category?: string;
  urgency?: UrgencyLevel;
  /** True = override record older than the 12h response window. */
  escalated?: boolean;
}

/**
 * Finds a booking by id.
 *
 * @param conn - the database connection or active transaction
 * @param bookingId - the booking id
 * @returns the booking row, or null when not found
 */
export async function findBookingById(conn: DbOrTx, bookingId: string) {
  const [row] = await conn
    .select()
    .from(booking)
    .where(eq(booking.id, bookingId))
    .limit(1);
  return row ?? null;
}

/**
 * Lists bookings by state with cursor pagination (fetches limit+1 for nextCursor).
 *
 * @param conn - the database connection or active transaction
 * @param states - states to filter by (empty means all)
 * @param limit - the max number of rows to return
 * @param cursor - optional booking id to page after
 * @returns the matching booking rows ordered by id
 */
export async function listBookingsByState(
  conn: DbOrTx,
  states: string[],
  limit: number,
  cursor?: string,
  opts?: ListOverridesQueryOptions,
) {
  const conditions = [];
  if (states.length > 0) {
    conditions.push(inArray(booking.currentState, states));
  }
  if (cursor) {
    // Composite cursor: "<rank>~<scheduledStartAt ISO>~<id>". Falls back to a
    // legacy plain-id cursor (id > cursor) for backward compatibility.
    const parts = cursor.split("~");
    if (parts.length === 3) {
      const rank = Number(parts[0]);
      const start = new Date(parts[1]!);
      if (Number.isInteger(rank) && !Number.isNaN(start.getTime())) {
        conditions.push(
          sql`(${URGENCY_RANK_EXPR}, ${booking.scheduledStartAt}, ${booking.id}) > (${rank}, ${start.toISOString()}, ${parts[2]})`,
        );
      } else {
        conditions.push(gt(booking.id, cursor));
      }
    } else {
      conditions.push(gt(booking.id, cursor));
    }
  }
  if (opts?.category) {
    conditions.push(
      sql`${booking.overrideMeta}->>'category' = ${opts.category}`,
    );
  }
  if (opts?.urgency) {
    conditions.push(inArray(booking.currentState, URGENCY_BANDS[opts.urgency]));
  }
  if (opts?.escalated === true) {
    conditions.push(
      sql`${booking.overrideMeta}->>'overriddenAt' < ${new Date(Date.now() - RESPONSE_WINDOW_MS).toISOString()}`,
    );
  }

  return conn
    .select()
    .from(booking)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(URGENCY_RANK_EXPR, asc(booking.scheduledStartAt), asc(booking.id))
    .limit(limit + 1);
}

/**
 * Fetches the chronological state history for a booking.
 *
 * @param conn - the database connection or active transaction
 * @param bookingId - the booking id
 * @returns the state history rows, oldest first
 */
export async function getStateHistory(conn: DbOrTx, bookingId: string) {
  return conn
    .select()
    .from(bookingStateHistory)
    .where(eq(bookingStateHistory.bookingId, bookingId))
    .orderBy(asc(bookingStateHistory.createdAt));
}

/**
 * Updates a booking's state with optimistic concurrency, returning the previous and new state.
 *
 * @param conn - the database connection or active transaction
 * @param bookingId - the booking id
 * @param newState - the state to transition to
 * @param reason - the state reason
 * @param overrideMeta - metadata recorded on the booking
 * @returns previousState and updated row, or null when the booking does not exist or the version raced
 */
export async function updateBookingWithOverride(
  conn: DbOrTx,
  bookingId: string,
  newState: string,
  reason: string | null,
  overrideMeta: Record<string, unknown>,
) {
  const [existing] = await conn
    .select({
      currentState: booking.currentState,
      version: booking.version,
    })
    .from(booking)
    .where(eq(booking.id, bookingId))
    .limit(1);

  if (!existing) return null;

  const result = await conn
    .update(booking)
    .set({
      previousState: existing.currentState,
      currentState: newState,
      stateReason: reason,
      overrideMeta,
      version: sql`${booking.version} + 1`,
    })
    .where(
      and(eq(booking.id, bookingId), eq(booking.version, existing.version)),
    )
    .returning();

  if (!result.length) return null;

  return { previousState: existing.currentState, updated: result[0] };
}

/**
 * Inserts a state history entry for an admin override.
 *
 * @param conn - the database connection or active transaction
 * @param params - the state history entry details
 */
export async function insertStateHistoryEntry(
  conn: DbOrTx,
  params: {
    bookingId: string;
    fromState: string | null;
    toState: string;
    reason: string | null;
    actorId: string | null;
    actorType: string;
    metadata?: Record<string, unknown>;
  },
) {
  await conn.insert(bookingStateHistory).values({
    bookingId: params.bookingId,
    fromState: params.fromState,
    toState: params.toState,
    reason: params.reason,
    actorId: params.actorId,
    actorType: params.actorType,
    metadata: params.metadata,
  });
}

/**
 * Finds participants of a booking.
 *
 * @param conn - the database connection or active transaction
 * @param bookingId - the booking id
 * @returns the participant rows
 */
export async function findParticipantsByBookingId(
  conn: DbOrTx,
  bookingId: string,
) {
  return conn
    .select()
    .from(bookingParticipant)
    .where(eq(bookingParticipant.bookingId, bookingId));
}

/**
 * Finds a payment record by id.
 *
 * @param conn - the database connection or active transaction
 * @param paymentId - the payment id
 * @returns the payment row, or null when not found
 */
export async function findPaymentById(conn: DbOrTx, paymentId: string) {
  const [row] = await conn
    .select()
    .from(paymentRecord)
    .where(eq(paymentRecord.id, paymentId))
    .limit(1);
  return row ?? null;
}

/**
 * Updates a payment record's status.
 *
 * @param conn - the database connection or active transaction
 * @param paymentId - the payment id
 * @param status - the new status
 * @returns the updated row, or null when the payment does not exist
 */
export async function updatePaymentStatus(
  conn: DbOrTx,
  paymentId: string,
  status: string,
) {
  const [updated] = await conn
    .update(paymentRecord)
    .set({ status, updatedAt: new Date() })
    .where(eq(paymentRecord.id, paymentId))
    .returning();
  return updated ?? null;
}

/**
 * Sets a booking's held Marks amount (used after release/compensation).
 *
 * @param conn - the database connection or active transaction
 * @param bookingId - the booking id
 * @param holdAmount - the new hold amount
 */
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

export function createAdminBookingRepo() {
  return {
    findBookingById,
    listBookingsByState,
    getStateHistory,
    updateBookingWithOverride,
    insertStateHistoryEntry,
    findParticipantsByBookingId,
    findPaymentById,
    updatePaymentStatus,
    updateBookingHoldAmount,
  };
}
