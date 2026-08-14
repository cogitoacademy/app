import type { DbType } from "../../lib/db";
import {
  RoomNotFoundError,
  RoomBookingConflictError,
  RoomBookingNotFoundError,
} from "./room.errors";
import type { RoomRepo } from "./room.repo";
import type { CreateRoomInput } from "./room.types";
import { ROOM_BOOKING_STATUS } from "../../shared/constants";
import type { RoomBookingPort } from "./index";

export type RoomService = ReturnType<typeof createRoomService>;

export function createRoomService(
  repo: RoomRepo,
  db: DbType,
  bookingPort?: RoomBookingPort,
) {
  async function listActive() {
    return repo.findActiveRooms(db);
  }

  async function createRoom(input: CreateRoomInput) {
    return repo.insertRoom(db, input);
  }

  async function checkAvailability(
    roomId: string,
    startAt: Date,
    endAt: Date,
    excludeBookingId?: string,
  ) {
    const existing = await repo.findRoomBookings(
      db,
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
    actorId?: string,
  ) {
    return db.transaction(async (tx) => {
      const roomRow = await repo.findRoomById(tx, roomId);
      if (!roomRow) throw new RoomNotFoundError(roomId);

      const conflicting = await repo.findRoomBookingsForUpdate(
        tx,
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

      const inserted = await repo.insertRoomBooking(tx, {
        roomId,
        bookingId,
        startAt,
        endAt,
        status: ROOM_BOOKING_STATUS.CONFIRMED,
      });

      if (bookingPort && actorId) {
        await bookingPort.transitionBookingToScheduled(
          tx,
          bookingId,
          actorId,
        );
      }

      return inserted;
    });
  }

  async function relocateRoom(
    bookingId: string,
    roomId: string,
    startAt: Date,
    endAt: Date,
  ) {
    return db.transaction(async (tx) => {
      const roomRow = await repo.findRoomById(tx, roomId);
      if (!roomRow) throw new RoomNotFoundError(roomId);

      const current = await repo.findActiveRoomBookingByBookingId(
        tx,
        bookingId,
      );
      if (!current) throw new RoomBookingNotFoundError(bookingId);

      const conflicting = await repo.findRoomBookingsForUpdate(
        tx,
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

      await repo.updateRoomBookingStatus(
        tx,
        current.id,
        ROOM_BOOKING_STATUS.RELOCATED,
      );

      return repo.insertRoomBooking(tx, {
        roomId,
        bookingId,
        startAt,
        endAt,
        status: ROOM_BOOKING_STATUS.CONFIRMED,
      });
    });
  }

  async function cancelRoomBooking(bookingId: string) {
    return db.transaction(async (tx) => {
      const current = await repo.findActiveRoomBookingByBookingId(
        tx,
        bookingId,
      );
      if (!current) throw new RoomBookingNotFoundError(bookingId);

      return repo.updateRoomBookingStatus(
        tx,
        current.id,
        ROOM_BOOKING_STATUS.CANCELLED,
      );
    });
  }

  return {
    listActive,
    createRoom,
    checkAvailability,
    assignRoom,
    relocateRoom,
    cancelRoomBooking,
  };
}
