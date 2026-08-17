import { ORPCError } from "@orpc/server";
import { DomainError } from "../../lib/domain-errors";
import {
  notFound,
  conflict,
  badRequest,
  internalServerError,
} from "../../lib/errors";
import { BookingNotEditableError } from "../booking/booking.errors";
import { BookingStateTransitionError } from "../booking/booking.errors";

export class BookingNotFoundError extends DomainError {
  readonly domain = "admin-booking";
  constructor(id: string) {
    super("ADMIN_BOOKING_NOT_FOUND", "Booking not found", { id });
  }
}

export class TerminalStateOverrideError extends DomainError {
  readonly domain = "admin-booking";
  constructor(id: string, status: string) {
    super(
      "TERMINAL_STATE_OVERRIDE",
      "Cannot override a booking in terminal state",
      { id, status },
    );
  }
}

export class InvalidRefundStateError extends DomainError {
  readonly domain = "admin-booking";
  constructor(id: string, status: string) {
    super("INVALID_REFUND_STATE", "Invalid refund state for this action", {
      id,
      status,
    });
  }
}

export class RefundSpendExhaustedError extends DomainError {
  readonly domain = "admin-booking";
  constructor(id: string) {
    super(
      "REFUND_SPEND_EXHAUSTED",
      "All credited Marks for this payment were spent — no blind refund; use a compensating correction instead",
      { id },
    );
  }
}

export class BookingOverrideConflictError extends DomainError {
  readonly domain = "admin-booking";
  constructor(id: string) {
    super("BOOKING_OVERRIDE_CONFLICT", "Booking changed concurrently", { id });
  }
}

export class OverrideMarksParticipantsRequiredError extends DomainError {
  readonly domain = "admin-booking";
  constructor(id: string) {
    super(
      "OVERRIDE_MARKS_PARTICIPANTS_REQUIRED",
      "A marksAction requires at least one affectedParticipant so the money action is never a silent no-op",
      { id },
    );
  }
}

export function mapAdminBookingError(
  err: DomainError,
): ORPCError<string, undefined> {
  if (err instanceof BookingNotFoundError) return notFound(err.message, err);
  if (err instanceof TerminalStateOverrideError)
    return conflict(err.message, err);
  if (err instanceof BookingOverrideConflictError)
    return conflict(err.message, err);
  if (err instanceof OverrideMarksParticipantsRequiredError)
    return badRequest(err.message, err);
  if (err instanceof InvalidRefundStateError)
    return badRequest(err.message, err);
  if (err instanceof RefundSpendExhaustedError)
    return badRequest(err.message, err);
  if (err instanceof BookingNotEditableError)
    return badRequest(err.message, err);
  if (err instanceof BookingStateTransitionError)
    return conflict(err.message, err);
  return internalServerError(err.message, err);
}
