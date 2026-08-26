import type { DbType } from "../../lib/db";
import type { DbOrTx } from "../../lib/tx";
import {
  RoomNotFoundError,
  RoomBookingConflictError,
  RoomBookingNotFoundError,
  RoomBookingStateError,
} from "./room.errors";
import type { RoomRepo } from "./room.repo";
import type { CreateRoomInput } from "./room.types";
import {
  NOTIFICATION_CATEGORY,
  NOTIFICATION_SEVERITY,
  ROOM_BOOKING_STATUS,
} from "../../shared/constants";
import { BOOKING_STATE } from "../booking/booking-state.types";
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

  async function listPendingApprovals(limit = 50) {
    return repo.findPendingRoomApprovals(db, limit);
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

      // F22: only offline bookings awaiting admin room approval may be
      // assigned a room. `reschedule_proposed` is the H3 carve-out — an admin
      // can pre-assign while the reschedule proposal is pending; the
      // transition applies when the proposal settles. Any other state (e.g. a
      // CONFIRMED online booking) must not receive a CONFIRMED roomBooking
      // row — the old code no-op'd the transition and left an orphan row.
      const currentState = await repo.findBookingStateById(tx, bookingId);
      if (
        currentState !== BOOKING_STATE.AWAITING_ADMIN_ROOM_APPROVAL &&
        currentState !== BOOKING_STATE.RESCHEDULE_PROPOSED
      ) {
        throw new RoomBookingStateError(bookingId, currentState ?? "unknown");
      }

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

      // F22: relocate only applies to offline bookings that are awaiting room
      // approval or already scheduled (relocating a scheduled room is the H3
      // no-op path). Anything else must not receive a new CONFIRMED row.
      const currentState = await repo.findBookingStateById(tx, bookingId);
      if (
        currentState !== BOOKING_STATE.AWAITING_ADMIN_ROOM_APPROVAL &&
        currentState !== BOOKING_STATE.SCHEDULED &&
        currentState !== BOOKING_STATE.RESCHEDULE_PROPOSED
      ) {
        throw new RoomBookingStateError(bookingId, currentState ?? "unknown");
      }

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

  async function cancelRoomBooking(bookingId: string, actorId?: string) {
    return db.transaction(async (tx) => {
      const current = await repo.findCancellableRoomBookingByBookingId(
        tx,
        bookingId,
      );
      if (!current) {
        const pending = await repo.findPendingApprovalBookingById(
          tx,
          bookingId,
        );
        if (!pending || !bookingPort || !actorId) {
          throw new RoomBookingNotFoundError(bookingId);
        }

        // A requested room can be absent when the student's preferred room
        // was already occupied. The booking is still cancellable while it is
        // awaiting admin room approval; let the booking port perform the
        // state transition, hold release, and audit atomically.
        await bookingPort.cancelOfflineBooking(tx, bookingId, actorId);
        await notifyBookingRecipients(
          tx,
          bookingId,
          `room.${bookingId}.cancelled`,
          "Offline room assignment cancelled",
          "Your offline room assignment was cancelled by an admin.",
        );

        return {
          id: null,
          bookingId,
          roomId: null,
          startAt: pending.scheduledStartAt,
          endAt: pending.scheduledEndAt,
          status: ROOM_BOOKING_STATUS.CANCELLED,
        };
      }

      const updated = await repo.updateRoomBookingStatus(
        tx,
        current.id,
        ROOM_BOOKING_STATUS.CANCELLED,
      );

      // M6 / FR-22: "cancel only if no room is available" — a booking still
      // awaiting room approval cannot continue without a room: cancel it
      // (transition + hold release + audit) in the same transaction. A
      // booking that already got its room (SCHEDULED) continues without one.
      if (bookingPort && actorId) {
        await bookingPort.cancelOfflineBooking(tx, bookingId, actorId);
      }

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

  /**
   * Cancels a still-pending (`requested`) room booking row. Called by the
   * booking module when a participant withdraws from an offline booking in
   * AWAITING_ADMIN_ROOM_APPROVAL (M7) so an admin `assignRoom` mid-
   * reconfirmation cannot resurrect a room for a booking that went back to
   * tutor review. No-op when the request was already confirmed/cancelled.
   */
  async function cancelRequestedRoomForBooking(
    conn: DbOrTx,
    bookingId: string,
  ): Promise<void> {
    const pending = await repo.findRequestedRoomBookingByBookingId(
      conn,
      bookingId,
    );
    if (!pending) return;
    await repo.updateRoomBookingStatus(
      conn,
      pending.id,
      ROOM_BOOKING_STATUS.CANCELLED,
    );
  }

  /**
   * N3: resyncs a booking's confirmed roomBooking row back to a given
   * schedule. The RESCHEDULE_PROPOSED carve-out lets an admin pre-assign a
   * room at the proposal time before the proposal settles; when the proposal
   * is later REJECTED or EXPIRES the booking keeps its original schedule, so
   * the confirmed row must be moved back — otherwise the room stays blocked
   * for the wrong window while the session happens at the original time.
   * No-op when the booking has no confirmed room row (online bookings,
   * not-yet-assigned offline bookings).
   */
  async function resyncRoomBookingToSchedule(
    conn: DbOrTx,
    bookingId: string,
    schedule: { startAt: Date; endAt: Date },
  ): Promise<void> {
    const current = await repo.findActiveRoomBookingByBookingId(
      conn,
      bookingId,
    );
    if (!current) return;
    if (
      current.startAt.getTime() === schedule.startAt.getTime() &&
      current.endAt.getTime() === schedule.endAt.getTime()
    ) {
      return;
    }
    await repo.updateRoomBookingTimes(conn, current.id, schedule);
  }

  /**
   * Keeps a confirmed room assignment aligned with a booking-level
   * reschedule. A conflicting target window cancels the active assignment so
   * the booking can return to the room-approval queue without leaving a room
   * reserved at the wrong time.
   */
  async function syncRoomBookingScheduleForBooking(
    conn: DbOrTx,
    bookingId: string,
    startAt: Date,
    endAt: Date,
  ): Promise<"updated" | "missing" | "conflict"> {
    const current = await repo.findActiveRoomBookingByBookingId(
      conn,
      bookingId,
    );
    if (!current) return "missing";

    const conflicting = await repo.findRoomBookingsForUpdate(
      conn,
      current.roomId,
      startAt,
      endAt,
      bookingId,
    );
    if (conflicting.length > 0) {
      await repo.updateRoomBookingStatus(
        conn,
        current.id,
        ROOM_BOOKING_STATUS.CANCELLED,
      );
      return "conflict";
    }

    await repo.updateRoomBookingSchedule(conn, current.id, startAt, endAt);
    return "updated";
  }

  return {
    listActive,
    listPendingApprovals,
    createRoom,
    checkAvailability,
    requestRoomForBooking,
    assignRoom,
    relocateRoom,
    cancelRoomBooking,
    cancelRequestedRoomForBooking,
    resyncRoomBookingToSchedule,
    syncRoomBookingScheduleForBooking,
  };
}
