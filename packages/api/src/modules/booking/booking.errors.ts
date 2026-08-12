import { ORPCError } from "@orpc/server";
import { DomainError } from "../../lib/domain-errors";
import {
  notFound,
  forbidden,
  badRequest,
  conflict,
  internalServerError,
} from "../../lib/errors";

export class BookingNotFoundError extends DomainError {
  readonly domain = "booking";
  constructor(id: string) {
    super("BOOKING_NOT_FOUND", "Booking not found", { id });
  }
}

export class BookingNotEditableError extends DomainError {
  readonly domain = "booking";
  constructor(id: string) {
    super("BOOKING_NOT_EDITABLE", "Booking is not editable", { id });
  }
}

export class BookingSessionNotEndedError extends DomainError {
  readonly domain = "booking";
  constructor(id: string, scheduledEndAt: Date) {
    super("BOOKING_SESSION_NOT_ENDED", "Session has not ended yet", {
      id,
      scheduledEndAt: scheduledEndAt.toISOString(),
    });
  }
}

export class InsufficientMarksError extends DomainError {
  readonly domain = "booking";
  constructor(required: number, available: number) {
    super("INSUFFICIENT_MARKS", "Insufficient marks", { required, available });
  }
}

export class BookingConflictError extends DomainError {
  readonly domain = "booking";
  constructor(tutorId: string, startAt: string, endAt: string) {
    super("BOOKING_CONFLICT", "Booking time conflict", {
      tutorId,
      startAt,
      endAt,
    });
  }
}

export class BookingStateTransitionError extends DomainError {
  readonly domain = "booking";
  constructor(from: string, event: string, to: string) {
    super("BOOKING_STATE_TRANSITION", "Invalid state transition", {
      from,
      event,
      to,
    });
  }
}

export class BookingNotOwnedError extends DomainError {
  readonly domain = "booking";
  constructor(id: string, userId: string) {
    super("BOOKING_NOT_OWNED", "You do not own this booking", { id, userId });
  }
}

export class BookingAlreadyConfirmedError extends DomainError {
  readonly domain = "booking";
  constructor(id: string) {
    super("BOOKING_ALREADY_CONFIRMED", "Booking is already confirmed", { id });
  }
}

export class BookingNotAwaitingConfirmationError extends DomainError {
  readonly domain = "booking";
  constructor(id: string, status: string) {
    super(
      "BOOKING_NOT_AWAITING_CONFIRMATION",
      "Booking is not awaiting confirmation",
      { id, status },
    );
  }
}

export class BookingNotAwaitingReconfirmationError extends DomainError {
  readonly domain = "booking";
  constructor(id: string, status: string) {
    super(
      "BOOKING_NOT_AWAITING_RECONFIRMATION",
      "Booking is not awaiting reconfirmation",
      { id, status },
    );
  }
}

export class BookingCancellationDeadlinePassedError extends DomainError {
  readonly domain = "booking";
  constructor(id: string) {
    super(
      "BOOKING_CANCELLATION_DEADLINE_PASSED",
      "Cancellation deadline has passed",
      { id },
    );
  }
}

export class BookingRoomNotAssignedError extends DomainError {
  readonly domain = "booking";
  constructor(id: string) {
    super("BOOKING_ROOM_NOT_ASSIGNED", "Room not assigned", { id });
  }
}

export class BookingGroupSizeError extends DomainError {
  readonly domain = "booking";
  constructor(id: string, min: number, max: number) {
    super("BOOKING_GROUP_SIZE", "Invalid group size", { id, min, max });
  }
}

export class BookingSeriesSizeError extends DomainError {
  readonly domain = "booking";
  constructor(id: string, min: number, max: number) {
    super("BOOKING_SERIES_SIZE", "Invalid series size", { id, min, max });
  }
}

export class BookingParticipantNotFoundError extends DomainError {
  readonly domain = "booking";
  constructor(id: string) {
    super("BOOKING_PARTICIPANT_NOT_FOUND", "Participant not found", { id });
  }
}

export class BookingParticipantAlreadyConfirmedError extends DomainError {
  readonly domain = "booking";
  constructor(id: string) {
    super(
      "BOOKING_PARTICIPANT_ALREADY_CONFIRMED",
      "Participant has already confirmed",
      { id },
    );
  }
}

export class BookingRescheduleNotFoundError extends DomainError {
  readonly domain = "booking";
  constructor(id: string) {
    super("BOOKING_RESCHEDULE_NOT_FOUND", "Reschedule proposal not found", {
      id,
    });
  }
}

export class BookingRescheduleNotPendingError extends DomainError {
  readonly domain = "booking";
  constructor(id: string) {
    super(
      "BOOKING_RESCHEDULE_NOT_PENDING",
      "Reschedule proposal is not pending",
      { id },
    );
  }
}

export class BookingNotAwaitingReviewError extends DomainError {
  readonly domain = "booking";
  constructor(id: string, status: string) {
    super(
      "BOOKING_NOT_AWAITING_REVIEW",
      "Booking is not awaiting tutor review",
      { id, status },
    );
  }
}

export class BookingTutorNotAssignedError extends DomainError {
  readonly domain = "booking";
  constructor(id: string) {
    super("BOOKING_TUTOR_NOT_ASSIGNED", "No tutor assigned to this booking", {
      id,
    });
  }
}

export class BookingHoldExpiredError extends DomainError {
  readonly domain = "booking";
  constructor(id: string) {
    super("BOOKING_HOLD_EXPIRED", "Booking hold has expired", { id });
  }
}

export class BookingDuplicateHoldError extends DomainError {
  readonly domain = "booking";
  constructor(id: string) {
    super("BOOKING_DUPLICATE_HOLD", "Duplicate hold attempt", { id });
  }
}

export class BookingExpiredError extends DomainError {
  readonly domain = "booking";
  constructor(id: string) {
    super("BOOKING_EXPIRED", "Booking has expired", { id });
  }
}

export class BookingNoShowError extends DomainError {
  readonly domain = "booking";
  constructor(id: string) {
    super("BOOKING_NO_SHOW", "Booking marked as no-show", { id });
  }
}

export class BookingCancelledError extends DomainError {
  readonly domain = "booking";
  constructor(id: string) {
    super("BOOKING_CANCELLED", "Booking has been cancelled", { id });
  }
}

export class BookingSessionNotFoundError extends DomainError {
  readonly domain = "booking";
  constructor(id: string) {
    super("BOOKING_SESSION_NOT_FOUND", "Series session not found", { id });
  }
}

export class BookingSessionRequiredError extends DomainError {
  readonly domain = "booking";
  constructor(id: string) {
    super(
      "BOOKING_SESSION_REQUIRED",
      "A series session id is required to complete a series",
      { id },
    );
  }
}

export class BookingSessionNotStartedError extends DomainError {
  readonly domain = "booking";
  constructor(id: string) {
    super(
      "BOOKING_SESSION_NOT_STARTED",
      "Series session has not started yet",
      { id },
    );
  }
}

export class BookingSessionNotCancellableError extends DomainError {
  readonly domain = "booking";
  constructor(id: string) {
    super(
      "BOOKING_SESSION_NOT_CANCELLABLE",
      "This series session cannot be cancelled",
      { id },
    );
  }
}

export class BookingNotCompletedError extends DomainError {
  readonly domain = "booking";
  constructor(id: string) {
    super("BOOKING_NOT_COMPLETED", "Booking has not been completed", { id });
  }
}

export function mapBookingError(
  err: DomainError,
): ORPCError<string, undefined> {
  if (err instanceof BookingNotFoundError) return notFound(err.message, err);
  if (err instanceof BookingRescheduleNotFoundError)
    return notFound(err.message, err);
  if (err instanceof BookingParticipantNotFoundError)
    return notFound(err.message, err);
  if (err instanceof BookingSessionNotFoundError)
    return notFound(err.message, err);
  if (err instanceof BookingSessionRequiredError)
    return badRequest(err.message, err);
  if (err instanceof BookingSessionNotStartedError)
    return badRequest(err.message, err);
  if (err instanceof BookingTutorNotAssignedError)
    return notFound(err.message, err);
  if (err instanceof BookingNotOwnedError) return forbidden(err.message, err);
  if (err instanceof BookingConflictError) return conflict(err.message, err);
  if (err instanceof BookingAlreadyConfirmedError)
    return conflict(err.message, err);
  if (err instanceof BookingDuplicateHoldError)
    return conflict(err.message, err);
  if (err instanceof BookingStateTransitionError)
    return conflict(err.message, err);
  if (err instanceof BookingNotEditableError)
    return badRequest(err.message, err);
  if (err instanceof BookingSessionNotEndedError)
    return badRequest(err.message, err);
  if (err instanceof InsufficientMarksError)
    return badRequest(err.message, err);
  if (err instanceof BookingNotAwaitingConfirmationError)
    return badRequest(err.message, err);
  if (err instanceof BookingNotAwaitingReconfirmationError)
    return badRequest(err.message, err);
  if (err instanceof BookingNotAwaitingReviewError)
    return badRequest(err.message, err);
  if (err instanceof BookingCancellationDeadlinePassedError)
    return badRequest(err.message, err);
  if (err instanceof BookingGroupSizeError) return badRequest(err.message, err);
  if (err instanceof BookingSeriesSizeError)
    return badRequest(err.message, err);
  if (err instanceof BookingParticipantAlreadyConfirmedError)
    return badRequest(err.message, err);
  if (err instanceof BookingRescheduleNotPendingError)
    return badRequest(err.message, err);
  if (err instanceof BookingSessionNotCancellableError)
    return badRequest(err.message, err);
  if (err instanceof BookingNotCompletedError)
    return badRequest(err.message, err);
  if (err instanceof BookingRoomNotAssignedError)
    return badRequest(err.message, err);
  if (err instanceof BookingHoldExpiredError)
    return badRequest(err.message, err);
  if (err instanceof BookingExpiredError) return badRequest(err.message, err);
  if (err instanceof BookingNoShowError) return badRequest(err.message, err);
  if (err instanceof BookingCancelledError) return badRequest(err.message, err);
  return internalServerError(err.message, err);
}
