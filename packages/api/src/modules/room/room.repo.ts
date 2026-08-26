import { eq, and, gte, lte, ne, desc, asc, inArray } from "drizzle-orm";
import { booking, room, roomBooking } from "@cogito-app/db/schema";
import type { DbOrTx } from "../../lib/tx";
import { ROOM_BOOKING_STATUS } from "../../shared/constants";
import { BOOKING_STATE } from "../booking/booking-state.types";

export type RoomRepo = ReturnType<typeof createRoomRepo>;

/**
 * Lists all active rooms.
 *
 * @param conn - the database connection or active transaction
 * @returns the active room rows
 */
export async function findActiveRooms(conn: DbOrTx) {
  return conn.select().from(room).where(eq(room.isActive, true));
}

/**
 * Lists offline bookings waiting for admin room approval. A booking may not
 * have a requested room row when the requested room was already occupied, so
 * this intentionally starts from booking and left-joins the optional request.
 */
export async function findPendingRoomApprovals(conn: DbOrTx, limit = 50) {
  return conn
    .select({
      bookingId: booking.id,
      bookingType: booking.type,
      modality: booking.modality,
      currentState: booking.currentState,
      tutorId: booking.tutorId,
      proposerId: booking.proposerId,
      targetGroupSize: booking.targetGroupSize,
      confirmedHeadcount: booking.confirmedHeadcount,
      scheduledStartAt: booking.scheduledStartAt,
      scheduledEndAt: booking.scheduledEndAt,
      timezone: booking.timezone,
      deadlineAt: booking.deadlineAt,
      originalMarks: booking.originalMarks,
      holdAmount: booking.holdAmount,
      requestedRoomBookingId: roomBooking.id,
      requestedRoomId: roomBooking.roomId,
      requestedRoomName: room.name,
      requestedRoomLocation: room.location,
      requestedRoomCapacity: room.capacity,
      requestedAt: roomBooking.createdAt,
    })
    .from(booking)
    .leftJoin(
      roomBooking,
      and(
        eq(roomBooking.bookingId, booking.id),
        eq(roomBooking.status, ROOM_BOOKING_STATUS.REQUESTED),
      ),
    )
    .leftJoin(room, eq(room.id, roomBooking.roomId))
    .where(
      and(
        eq(booking.currentState, BOOKING_STATE.AWAITING_ADMIN_ROOM_APPROVAL),
        eq(booking.modality, "offline"),
      ),
    )
    .orderBy(asc(booking.scheduledStartAt), asc(booking.id))
    .limit(limit);
}

/**
 * Finds a pending offline booking that has no room-booking row yet. This is
 * used only by the admin cancellation path for requested-room conflicts.
 */
/**
 * Finds a pending offline booking that has no room-booking row yet. This is
 * used only by the admin cancellation path for requested-room conflicts.
 */
export async function findPendingApprovalBookingById(
  conn: DbOrTx,
  bookingId: string,
) {
  const [row] = await conn
    .select({
      id: booking.id,
      scheduledStartAt: booking.scheduledStartAt,
      scheduledEndAt: booking.scheduledEndAt,
    })
    .from(booking)
    .where(
      and(
        eq(booking.id, bookingId),
        eq(booking.currentState, BOOKING_STATE.AWAITING_ADMIN_ROOM_APPROVAL),
        eq(booking.modality, "offline"),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Returns a booking's current state (F22 room-assignment guard).
 *
 * @param conn - the database connection or active transaction
 * @param bookingId - the booking id
 * @returns the current state string, or null when the booking does not exist
 */
export async function findBookingStateById(conn: DbOrTx, bookingId: string) {
  const [row] = await conn
    .select({ currentState: booking.currentState })
    .from(booking)
    .where(eq(booking.id, bookingId))
    .limit(1);
  return row?.currentState ?? null;
}

/**
 * Inserts a new room.
 *
 * @param conn - the database connection or active transaction
 * @param values - the room fields (name, location, capacity)
 * @returns the inserted room row
 */
export async function insertRoom(
  conn: DbOrTx,
  values: { name: string; location: string; capacity: number },
) {
  const [row] = await conn.insert(room).values(values).returning();
  return row!;
}

/**
 * Finds an active room by id.
 *
 * @param conn - the database connection or active transaction
 * @param roomId - the room id
 * @returns the room row, or null
 */
export async function findRoomById(conn: DbOrTx, roomId: string) {
  return conn.query.room.findFirst({
    where: and(eq(room.id, roomId), eq(room.isActive, true)),
  });
}

/**
 * Finds a confirmed room booking overlapping the given window, optionally excluding a booking.
 *
 * @param conn - the database connection or active transaction
 * @param roomId - the room id
 * @param startAt - window start
 * @param endAt - window end
 * @param excludeBookingId - optional booking to exclude
 * @returns the first overlapping booking, or empty
 */
export async function findRoomBookings(
  conn: DbOrTx,
  roomId: string,
  startAt: Date,
  endAt: Date,
  excludeBookingId?: string,
) {
  const conditions = [
    eq(roomBooking.roomId, roomId),
    eq(roomBooking.status, ROOM_BOOKING_STATUS.CONFIRMED),
    lte(roomBooking.startAt, endAt),
    gte(roomBooking.endAt, startAt),
  ];
  if (excludeBookingId) {
    conditions.push(ne(roomBooking.bookingId, excludeBookingId));
  }
  return conn
    .select()
    .from(roomBooking)
    .where(and(...conditions))
    .limit(1);
}

/**
 * Like findRoomBookings but locks matching rows FOR UPDATE to prevent concurrent booking.
 *
 * @param conn - the database connection or active transaction
 * @param roomId - the room id
 * @param startAt - window start
 * @param endAt - window end
 * @param excludeBookingId - optional booking to exclude
 * @returns the first overlapping booking row locked for update
 */
export async function findRoomBookingsForUpdate(
  conn: DbOrTx,
  roomId: string,
  startAt: Date,
  endAt: Date,
  excludeBookingId?: string,
) {
  const conditions = [
    eq(roomBooking.roomId, roomId),
    eq(roomBooking.status, ROOM_BOOKING_STATUS.CONFIRMED),
    lte(roomBooking.startAt, endAt),
    gte(roomBooking.endAt, startAt),
  ];
  if (excludeBookingId) {
    conditions.push(ne(roomBooking.bookingId, excludeBookingId));
  }
  return conn
    .select()
    .from(roomBooking)
    .where(and(...conditions))
    .for("update")
    .limit(1);
}

/**
 * Inserts a room booking row.
 *
 * @param conn - the database connection or active transaction
 * @param values - the room booking fields
 * @returns the inserted room booking row
 */
export async function insertRoomBooking(
  conn: DbOrTx,
  values: {
    roomId: string;
    bookingId: string;
    startAt: Date;
    endAt: Date;
    status: string;
  },
) {
  const [row] = await conn.insert(roomBooking).values(values).returning();
  return row!;
}

/**
 * Returns the most recent confirmed room booking for a booking — the active
 * room assignment. Relocated and cancelled rows are historical.
 */
export async function findActiveRoomBookingByBookingId(
  conn: DbOrTx,
  bookingId: string,
) {
  return conn.query.roomBooking.findFirst({
    where: and(
      eq(roomBooking.bookingId, bookingId),
      eq(roomBooking.status, ROOM_BOOKING_STATUS.CONFIRMED),
    ),
    orderBy: [desc(roomBooking.createdAt)],
  });
}

export async function updateRoomBookingStatus(
  conn: DbOrTx,
  roomBookingId: string,
  status: string,
) {
  const [row] = await conn
    .update(roomBooking)
    .set({ status })
    .where(eq(roomBooking.id, roomBookingId))
    .returning();
  return row!;
}

/**
 * Returns the most recent `requested` room booking for a booking — the
 * pending room request created at booking-creation time (U14) that has not
 * been confirmed or cancelled yet.
 */
export async function findRequestedRoomBookingByBookingId(
  conn: DbOrTx,
  bookingId: string,
) {
  return conn.query.roomBooking.findFirst({
    where: and(
      eq(roomBooking.bookingId, bookingId),
      eq(roomBooking.status, ROOM_BOOKING_STATUS.REQUESTED),
    ),
    orderBy: [desc(roomBooking.createdAt)],
  });
}

/**
 * Returns the most recent non-cancelled room booking for a booking — either a
 * live `confirmed` assignment or a still-pending `requested` row. Used by
 * `cancelRoomBooking` (M6) so an admin can cancel a booking's room before it
 * was ever confirmed.
 */
export async function findCancellableRoomBookingByBookingId(
  conn: DbOrTx,
  bookingId: string,
) {
  return conn.query.roomBooking.findFirst({
    where: and(
      eq(roomBooking.bookingId, bookingId),
      inArray(roomBooking.status, [
        ROOM_BOOKING_STATUS.REQUESTED,
        ROOM_BOOKING_STATUS.CONFIRMED,
      ]),
    ),
    orderBy: [desc(roomBooking.createdAt)],
  });
}

export function createRoomRepo() {
  return {
    findActiveRooms,
    findPendingRoomApprovals,
    findPendingApprovalBookingById,
    findBookingStateById,
    insertRoom,
    findRoomById,
    findRoomBookings,
    findRoomBookingsForUpdate,
    insertRoomBooking,
    findActiveRoomBookingByBookingId,
    findRequestedRoomBookingByBookingId,
    findCancellableRoomBookingByBookingId,
    updateRoomBookingStatus,
  };
}
