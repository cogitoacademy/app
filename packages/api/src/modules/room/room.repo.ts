import { eq, and, gte, lte, ne } from "drizzle-orm";
import { room, roomBooking } from "@cogito-app/db/schema";
import type { DbType } from "../../lib/db";
import type { DbOrTx } from "../../lib/tx";
import { ROOM_BOOKING_STATUS } from "../../shared/constants";

export type RoomRepo = ReturnType<typeof createRoomRepo>;

export async function findActiveRooms(conn: DbOrTx) {
  return conn.select().from(room).where(eq(room.isActive, true));
}

export async function insertRoom(
  conn: DbOrTx,
  values: { name: string; location: string; capacity: number },
) {
  const [row] = await conn.insert(room).values(values).returning();
  return row!;
}

export async function findRoomById(conn: DbOrTx, roomId: string) {
  return conn.query.room.findFirst({
    where: and(eq(room.id, roomId), eq(room.isActive, true)),
  });
}

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

export function createRoomRepo(db: DbType) {
  return {
    findActiveRooms: () => findActiveRooms(db),
    insertRoom: (values: {
      name: string;
      location: string;
      capacity: number;
    }) => insertRoom(db, values),
    findRoomById: (roomId: string) => findRoomById(db, roomId),
    findRoomBookings: (
      roomId: string,
      startAt: Date,
      endAt: Date,
      excludeBookingId?: string,
    ) => findRoomBookings(db, roomId, startAt, endAt, excludeBookingId),
    findRoomBookingsForUpdate: (
      roomId: string,
      startAt: Date,
      endAt: Date,
      excludeBookingId?: string,
    ) =>
      findRoomBookingsForUpdate(db, roomId, startAt, endAt, excludeBookingId),
    insertRoomBooking: (values: {
      roomId: string;
      bookingId: string;
      startAt: Date;
      endAt: Date;
      status: string;
    }) => insertRoomBooking(db, values),
  };
}
