import {
  and,
  asc,
  eq,
  getTableColumns,
  inArray,
  isNull,
  ne,
  or,
} from "drizzle-orm";
import {
  booking,
  bookingParticipant,
  contactRequest,
  studentProfile,
  user,
} from "@cogito-app/db/schema";
import type { DbOrTx } from "../../lib/tx";
import type { RequestContactInput } from "./contact.types";

const CONFIRMED_PARTICIPANT_STATES = ["confirmed", "reconfirmed"] as const;

export type ContactRequestRow = typeof contactRequest.$inferSelect;

export type ContactParticipantRow = {
  userId: string;
  role: string;
  confirmationState: string;
  attendanceState: string | null;
  name: string;
  image: string | null;
  email: string;
  allowContactRequests: boolean | null;
};

async function findBooking(conn: DbOrTx, bookingId: string) {
  const [row] = await conn
    .select({
      id: booking.id,
      type: booking.type,
      currentState: booking.currentState,
    })
    .from(booking)
    .where(eq(booking.id, bookingId))
    .limit(1);
  return row ?? null;
}

/**
 * Returns only student participants who completed the booking successfully
 * enough to be eligible for contact sharing. Email is deliberately an
 * internal field here and must never be returned by a handler directly.
 */
async function listEligibleParticipants(
  conn: DbOrTx,
  bookingId: string,
): Promise<ContactParticipantRow[]> {
  return conn
    .select({
      userId: bookingParticipant.userId,
      role: bookingParticipant.role,
      confirmationState: bookingParticipant.confirmationState,
      attendanceState: bookingParticipant.attendanceState,
      name: user.name,
      image: user.image,
      email: user.email,
      allowContactRequests: studentProfile.allowContactRequests,
    })
    .from(bookingParticipant)
    .innerJoin(user, eq(bookingParticipant.userId, user.id))
    .leftJoin(studentProfile, eq(studentProfile.userId, user.id))
    .where(
      and(
        eq(bookingParticipant.bookingId, bookingId),
        ne(bookingParticipant.role, "tutor"),
        eq(user.role, "student"),
        inArray(
          bookingParticipant.confirmationState,
          CONFIRMED_PARTICIPANT_STATES,
        ),
        or(
          isNull(bookingParticipant.attendanceState),
          ne(bookingParticipant.attendanceState, "absent"),
        ),
      ),
    )
    .orderBy(asc(bookingParticipant.createdAt));
}

async function findRequestForPair(
  conn: DbOrTx,
  bookingId: string,
  requesterId: string,
  recipientId: string,
) {
  const [row] = await conn
    .select({ ...getTableColumns(contactRequest) })
    .from(contactRequest)
    .where(
      and(
        eq(contactRequest.bookingId, bookingId),
        eq(contactRequest.requesterId, requesterId),
        eq(contactRequest.recipientId, recipientId),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function listRequestsForBooking(conn: DbOrTx, bookingId: string) {
  return conn
    .select({ ...getTableColumns(contactRequest) })
    .from(contactRequest)
    .where(eq(contactRequest.bookingId, bookingId));
}

async function findRequestById(conn: DbOrTx, requestId: string) {
  const [row] = await conn
    .select({ ...getTableColumns(contactRequest) })
    .from(contactRequest)
    .where(eq(contactRequest.id, requestId))
    .limit(1);
  return row ?? null;
}

async function insertRequest(
  conn: DbOrTx,
  input: {
    bookingId: string;
    requesterId: string;
    recipientId: string;
    message: RequestContactInput["message"] | null;
  },
) {
  const [row] = await conn
    .insert(contactRequest)
    .values({
      bookingId: input.bookingId,
      requesterId: input.requesterId,
      recipientId: input.recipientId,
      message: input.message ?? null,
    })
    .onConflictDoNothing({
      target: [
        contactRequest.bookingId,
        contactRequest.requesterId,
        contactRequest.recipientId,
      ],
    })
    .returning();
  return row ?? null;
}

async function respondToRequest(
  conn: DbOrTx,
  requestId: string,
  recipientId: string,
  status: "accepted" | "declined",
  emailShared: boolean,
) {
  const [row] = await conn
    .update(contactRequest)
    .set({
      status,
      emailShared,
      respondedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(contactRequest.id, requestId),
        eq(contactRequest.recipientId, recipientId),
        eq(contactRequest.status, "pending"),
      ),
    )
    .returning();
  return row ?? null;
}

export function createContactRepo() {
  return {
    findBooking,
    listEligibleParticipants,
    findRequestForPair,
    listRequestsForBooking,
    findRequestById,
    insertRequest,
    respondToRequest,
  };
}

export type ContactRepo = ReturnType<typeof createContactRepo>;
