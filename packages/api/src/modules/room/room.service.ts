import type { DbType } from "../../lib/db";
import { RoomNotFoundError, RoomBookingConflictError } from "./room.errors";
import type { RoomRepo } from "./room.repo";
import type { CreateRoomInput } from "./room.types";

export type RoomService = ReturnType<typeof createRoomService>;

export function createRoomService(repo: RoomRepo, db: DbType) {
  async function listActive() {
    return repo.findActiveRooms();
  }

  async function createRoom(input: CreateRoomInput) {
    return repo.insertRoom(input);
  }

  async function checkAvailability(
    roomId: string,
    startAt: Date,
    endAt: Date,
    excludeBookingId?: string,
  ) {
    const existing = await repo.findRoomBookings(
      roomId,
      startAt,
      endAt,
      excludeBookingId,
    );
    return existing.length === 0;
  }

  async function assignRoom(
    bookingId: string,
    roomId: string,
    startAt: Date,
    endAt: Date,
  ) {
    return db.transaction(async (_tx) => {
      const roomRow = await repo.findRoomById(roomId);
      if (!roomRow) throw new RoomNotFoundError(roomId);

      const conflicting = await repo.findRoomBookingsForUpdate(
        roomId,
        startAt,
        endAt,
        bookingId,
      );
      if (conflicting.length > 0)
        throw new RoomBookingConflictError(
          roomId,
          startAt.toISOString(),
          endAt.toISOString(),
        );

      return repo.insertRoomBooking({
        roomId,
        bookingId,
        startAt,
        endAt,
        status: "confirmed",
      });
    });
  }

  return { listActive, createRoom, checkAvailability, assignRoom };
}
