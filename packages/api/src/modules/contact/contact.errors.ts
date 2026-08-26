import { ORPCError } from "@orpc/server";

import { DomainError } from "../../lib/domain-errors";
import {
  badRequest,
  conflict,
  forbidden,
  internalServerError,
  notFound,
} from "../../lib/errors";

const UNAVAILABLE_MESSAGE =
  "Contact sharing is not available for this booking.";

export class ContactBookingUnavailableError extends DomainError {
  readonly domain = "contact";

  constructor(bookingId: string) {
    super("CONTACT_BOOKING_UNAVAILABLE", UNAVAILABLE_MESSAGE, { bookingId });
  }
}

export class ContactBookingNotCompletedError extends DomainError {
  readonly domain = "contact";

  constructor(bookingId: string) {
    super(
      "CONTACT_BOOKING_NOT_COMPLETED",
      "Contact requests are available after the shared session is completed.",
      { bookingId },
    );
  }
}

export class ContactParticipantUnavailableError extends DomainError {
  readonly domain = "contact";

  constructor(bookingId: string) {
    super("CONTACT_PARTICIPANT_UNAVAILABLE", UNAVAILABLE_MESSAGE, {
      bookingId,
    });
  }
}

export class ContactRequestsDisabledError extends DomainError {
  readonly domain = "contact";

  constructor(userId: string) {
    super(
      "CONTACT_REQUESTS_DISABLED",
      "This student is not accepting new contact requests.",
      { userId },
    );
  }
}

export class ContactRequestAlreadyExistsError extends DomainError {
  readonly domain = "contact";

  constructor(bookingId: string, recipientId: string) {
    super(
      "CONTACT_REQUEST_ALREADY_EXISTS",
      "A contact request already exists for this participant.",
      { bookingId, recipientId },
    );
  }
}

export class ContactRequestNotFoundError extends DomainError {
  readonly domain = "contact";

  constructor(requestId: string) {
    super("CONTACT_REQUEST_NOT_FOUND", "Contact request not found.", {
      requestId,
    });
  }
}

export class ContactRequestNotRecipientError extends DomainError {
  readonly domain = "contact";

  constructor(requestId: string) {
    super(
      "CONTACT_REQUEST_NOT_RECIPIENT",
      "Only the recipient can respond to this contact request.",
      { requestId },
    );
  }
}

export class ContactRequestAlreadyRespondedError extends DomainError {
  readonly domain = "contact";

  constructor(requestId: string) {
    super(
      "CONTACT_REQUEST_ALREADY_RESPONDED",
      "This contact request has already been answered.",
      { requestId },
    );
  }
}

export function mapContactError(
  err: DomainError,
): ORPCError<string, undefined> {
  if (err instanceof ContactBookingUnavailableError) {
    return notFound(err.message, err);
  }
  if (err instanceof ContactBookingNotCompletedError) {
    return badRequest(err.message, err);
  }
  if (err instanceof ContactParticipantUnavailableError) {
    return badRequest(err.message, err);
  }
  if (err instanceof ContactRequestsDisabledError) {
    return badRequest(err.message, err);
  }
  if (err instanceof ContactRequestAlreadyExistsError) {
    return conflict(err.message, err);
  }
  if (err instanceof ContactRequestNotFoundError) {
    return notFound(err.message, err);
  }
  if (err instanceof ContactRequestNotRecipientError) {
    return forbidden(err.message, err);
  }
  if (err instanceof ContactRequestAlreadyRespondedError) {
    return conflict(err.message, err);
  }
  return internalServerError(err.message, err);
}
