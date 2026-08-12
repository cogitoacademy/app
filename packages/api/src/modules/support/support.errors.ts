import { ORPCError } from "@orpc/server";
import { DomainError } from "../../lib/domain-errors";
import {
  notFound,
  badRequest,
  conflict,
  internalServerError,
} from "../../lib/errors";

export class SupportTicketNotFoundError extends DomainError {
  readonly domain = "support";
  constructor(id: string) {
    super("SUPPORT_TICKET_NOT_FOUND", "Support ticket not found", { id });
  }
}

export class SupportBookingAccessError extends DomainError {
  readonly domain = "support";
  constructor(bookingId: string) {
    super("SUPPORT_BOOKING_ACCESS", "You do not have access to this booking", {
      bookingId,
    });
  }
}

export class LatenessReportTooEarlyError extends DomainError {
  readonly domain = "support";
  constructor(bookingId: string) {
    super(
      "LATENESS_REPORT_TOO_EARLY",
      "Lateness/no-show can only be reported 15 minutes after the scheduled start time",
      { bookingId },
    );
  }
}

export class SupportTicketAlreadyResolvedError extends DomainError {
  readonly domain = "support";
  constructor(id: string) {
    super(
      "SUPPORT_TICKET_ALREADY_RESOLVED",
      "Support ticket is already resolved or closed",
      {
        id,
      },
    );
  }
}

export function mapSupportError(
  err: DomainError,
): ORPCError<string, undefined> {
  if (err instanceof SupportTicketNotFoundError)
    return notFound(err.message, err);
  if (err instanceof SupportBookingAccessError)
    return badRequest(err.message, err);
  if (err instanceof LatenessReportTooEarlyError)
    return badRequest(err.message, err);
  if (err instanceof SupportTicketAlreadyResolvedError)
    return conflict(err.message, err);
  return internalServerError(err.message, err);
}
