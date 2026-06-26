import { eq, and, gte, lte, ne } from "drizzle-orm";
import { room, roomBooking } from "@cogito-app/db/schema";
import type { DbType } from "../../lib/db";
import { notFound, conflict } from "../../lib/errors";

export type RoomService = ReturnType<typeof createRoomService>;

export interface CreateRoomInput {
  name: string;
  location: string;
  capacity: number;
}

export function createRoomService(db: DbType) {
  async function listActive() {
    return db.select().from(room).where(eq(room.isActive, true));
  }

  async function createRoom(input: CreateRoomInput) {
    const [row] = await db.insert(room).values(input).returning();
    return row!;
  }

  async function checkAvailability(
    roomId: string,
    startAt: Date,
    endAt: Date,
    excludeBookingId?: string,
  ) {
    const conditions = [
      eq(roomBooking.roomId, roomId),
      eq(roomBooking.status, "confirmed"),
      lte(roomBooking.startAt, endAt),
      gte(roomBooking.endAt, startAt),
    ];
    if (excludeBookingId) {
      conditions.push(ne(roomBooking.bookingId, excludeBookingId));
    }
    const existing = await db
      .select()
      .from(roomBooking)
      .where(and(...conditions))
      .limit(1);
    return existing.length === 0;
  }

  async function assignRoom(
    bookingId: string,
    roomId: string,
    startAt: Date,
    endAt: Date,
  ) {
    const roomRow = await db.query.room.findFirst({
      where: and(eq(room.id, roomId), eq(room.isActive, true)),
    });
    if (!roomRow) throw notFound("Room not found");

    const available = await checkAvailability(
      roomId,
      startAt,
      endAt,
      bookingId,
    );
    if (!available) throw conflict("Room is already booked for this time");

    const [row] = await db
      .insert(roomBooking)
      .values({
        roomId,
        bookingId,
        startAt,
        endAt,
        status: "confirmed",
      })
      .returning();
    return row!;
  }

  return { listActive, createRoom, checkAvailability, assignRoom };
}
