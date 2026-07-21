import { eq, asc, inArray } from "drizzle-orm";
import {
  booking,
  bookingStateHistory,
  bookingParticipant,
  paymentRecord,
} from "@cogito-app/db/schema";
import type { DbOrTx } from "../../lib/tx";

export type AdminBookingRepo = ReturnType<typeof createAdminBookingRepo>;

export async function findBookingById(conn: DbOrTx, bookingId: string) {
  const [row] = await conn
    .select()
    .from(booking)
    .where(eq(booking.id, bookingId))
    .limit(1);
  return row ?? null;
}

export async function listBookingsByState(
  conn: DbOrTx,
  states: string[],
  limit: number,
) {
  const query = conn
    .select()
    .from(booking)
    .orderBy(asc(booking.scheduledStartAt))
    .limit(limit + 1);

  if (states.length > 0) {
    return query.where(inArray(booking.currentState, states));
  }
  return query;
}

export async function getStateHistory(conn: DbOrTx, bookingId: string) {
  return conn
    .select()
    .from(bookingStateHistory)
    .where(eq(bookingStateHistory.bookingId, bookingId))
    .orderBy(asc(bookingStateHistory.createdAt));
}

export async function updateBookingWithOverride(
  conn: DbOrTx,
  bookingId: string,
  newState: string,
  reason: string | null,
  overrideMeta: Record<string, unknown>,
) {
  const [existing] = await conn
    .select({ currentState: booking.currentState })
    .from(booking)
    .where(eq(booking.id, bookingId))
    .limit(1);

  if (!existing) return null;

  const [updated] = await conn
    .update(booking)
    .set({
      previousState: existing.currentState,
      currentState: newState,
      stateReason: reason,
      overrideMeta,
    })
    .where(eq(booking.id, bookingId))
    .returning();

  return { previousState: existing.currentState, updated };
}

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

export async function findParticipantsByBookingId(
  conn: DbOrTx,
  bookingId: string,
) {
  return conn
    .select()
    .from(bookingParticipant)
    .where(eq(bookingParticipant.bookingId, bookingId));
}

export async function findPaymentById(conn: DbOrTx, paymentId: string) {
  const [row] = await conn
    .select()
    .from(paymentRecord)
    .where(eq(paymentRecord.id, paymentId))
    .limit(1);
  return row ?? null;
}

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
  };
}
