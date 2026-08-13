import { eq, and, gte, lte, ne, desc } from "drizzle-orm";
import { room, roomBooking } from "@cogito-app/db/schema";
import type { DbOrTx } from "../../lib/tx";
import { ROOM_BOOKING_STATUS } from "../../shared/constants";

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

export function createRoomRepo() {
  return {
    findActiveRooms,
    insertRoom,
    findRoomById,
    findRoomBookings,
    findRoomBookingsForUpdate,
    insertRoomBooking,
    findActiveRoomBookingByBookingId,
    updateRoomBookingStatus,
  };
}
