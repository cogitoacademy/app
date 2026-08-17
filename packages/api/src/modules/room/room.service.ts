import type { DbType } from "../../lib/db";
import type { DbOrTx } from "../../lib/tx";
import {
  RoomNotFoundError,
  RoomBookingConflictError,
  RoomBookingNotFoundError,
} from "./room.errors";
import type { RoomRepo } from "./room.repo";
import type { CreateRoomInput } from "./room.types";
import {
  NOTIFICATION_CATEGORY,
  NOTIFICATION_SEVERITY,
  ROOM_BOOKING_STATUS,
} from "../../shared/constants";
import type { RoomBookingPort, RoomNotificationPort } from "./index";

export type RoomService = ReturnType<typeof createRoomService>;

export function createRoomService(
  repo: RoomRepo,
  db: DbType,
  bookingPort?: RoomBookingPort,
  notificationPort?: RoomNotificationPort,
) {
  /**
   * Writes an in-app + email notification for the tutor and each confirmed
   * student of the booking (P1-3 offline-room notification matrix).
   */
  async function notifyBookingRecipients(
    tx: DbOrTx,
    bookingId: string,
    eventKey: string,
    title: string,
    body: string,
  ): Promise<void> {
    if (!notificationPort) return;
    const recipients = await bookingPort?.getBookingRecipients(tx, bookingId);
    if (!recipients) return;

    const userIds = [recipients.tutorId, ...recipients.participantUserIds];
    for (const userId of new Set(userIds)) {
      // eslint-disable-next-line no-await-in-loop
      await notificationPort.writeBestEffort({
        db: tx,
        userId,
        bookingId,
        category: NOTIFICATION_CATEGORY.BOOKING,
        severity: NOTIFICATION_SEVERITY.ACTION,
        title,
        body,
        eventKey: `${eventKey}.${userId}`,
        emailRequired: true,
      });
    }
  }

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

  /**
   * Requests a room for an offline booking at creation time (U14 / FR-22).
   * Runs inside the booking-creation transaction: creates a `requested`
   * roomBooking row when the room is free (no confirmed booking overlaps),
   * otherwise reports the conflict so the booking can proceed without a room.
   *
   * @param conn - the database connection or active transaction
   * @param params - the booking, room and slot
   * @returns availability result with the room booking id when requested
   */
  async function requestRoomForBooking(
    conn: DbOrTx,
    params: {
      bookingId: string;
      roomId: string;
      startAt: Date;
      endAt: Date;
    },
  ): Promise<{ available: boolean; reason?: string; roomBookingId?: string }> {
    const roomRow = await repo.findRoomById(conn, params.roomId);
    if (!roomRow) return { available: false, reason: "room_not_found" };

    const conflicting = await repo.findRoomBookings(
      conn,
      params.roomId,
      params.startAt,
      params.endAt,
      params.bookingId,
    );
    if (conflicting.length > 0) {
      return { available: false, reason: "taken" };
    }

    const inserted = await repo.insertRoomBooking(conn, {
      roomId: params.roomId,
      bookingId: params.bookingId,
      startAt: params.startAt,
      endAt: params.endAt,
      status: ROOM_BOOKING_STATUS.REQUESTED,
    });
    return { available: true, roomBookingId: inserted.id };
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
        await bookingPort.transitionBookingToScheduled(tx, bookingId, actorId);
      }

      await notifyBookingRecipients(
        tx,
        bookingId,
        `room.${bookingId}.assigned`,
        "Offline session confirmed",
        `Your offline session was confirmed in room ${roomRow.name}.`,
      );

      return inserted;
    });
  }

  async function relocateRoom(
    bookingId: string,
    roomId: string,
    startAt: Date,
    endAt: Date,
    actorId?: string,
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

      const inserted = await repo.insertRoomBooking(tx, {
        roomId,
        bookingId,
        startAt,
        endAt,
        status: ROOM_BOOKING_STATUS.CONFIRMED,
      });

      if (bookingPort && actorId) {
        await bookingPort.transitionBookingToScheduled(tx, bookingId, actorId);
      }

      await notifyBookingRecipients(
        tx,
        bookingId,
        `room.${bookingId}.relocated`,
        "Offline session relocated",
        `Your offline session was relocated to room ${roomRow.name}.`,
      );

      return inserted;
    });
  }

  async function cancelRoomBooking(bookingId: string) {
    return db.transaction(async (tx) => {
      const current = await repo.findActiveRoomBookingByBookingId(
        tx,
        bookingId,
      );
      if (!current) throw new RoomBookingNotFoundError(bookingId);

      const updated = await repo.updateRoomBookingStatus(
        tx,
        current.id,
        ROOM_BOOKING_STATUS.CANCELLED,
      );

      await notifyBookingRecipients(
        tx,
        bookingId,
        `room.${bookingId}.cancelled`,
        "Offline room assignment cancelled",
        "Your offline room assignment was cancelled by an admin.",
      );

      return updated;
    });
  }

  return {
    listActive,
    createRoom,
    checkAvailability,
    requestRoomForBooking,
    assignRoom,
    relocateRoom,
    cancelRoomBooking,
  };
}
