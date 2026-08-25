import { ORPCError } from "@orpc/server";
import { DomainError } from "../../lib/domain-errors";
import { notFound, conflict, internalServerError } from "../../lib/errors";

export class RoomNotFoundError extends DomainError {
  readonly domain = "room";
  constructor(id: string) {
    super("ROOM_NOT_FOUND", "Room not found", { id });
  }
}

export class RoomBookingConflictError extends DomainError {
  readonly domain = "room";
  constructor(roomId: string, startAt: string, endAt: string) {
    super(
      "ROOM_BOOKING_CONFLICT",
      "Room is already booked for this time slot",
      { roomId, startAt, endAt },
    );
  }
}

export class RoomBookingNotFoundError extends DomainError {
  readonly domain = "room";
  constructor(bookingId: string) {
    super("ROOM_BOOKING_NOT_FOUND", "Booking has no active room assignment", {
      bookingId,
    });
  }
}

export class RoomBookingStateError extends DomainError {
  readonly domain = "room";
  constructor(bookingId: string, currentState: string) {
    super(
      "ROOM_BOOKING_STATE",
      "Room assignment requires the booking to be awaiting admin room approval",
      { bookingId, currentState },
    );
  }
}

export function mapRoomError(err: DomainError): ORPCError<string, undefined> {
  if (err instanceof RoomNotFoundError) return notFound(err.message, err);
  if (err instanceof RoomBookingConflictError)
    return conflict(err.message, err);
  if (err instanceof RoomBookingNotFoundError)
    return notFound(err.message, err);
  if (err instanceof RoomBookingStateError)
    return conflict(err.message, err);
  return internalServerError(err.message, err);
}
