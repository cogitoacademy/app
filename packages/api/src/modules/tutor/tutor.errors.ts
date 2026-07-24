import { ORPCError } from "@orpc/server";
import { DomainError } from "../../lib/domain-errors";
import {
  notFound,
  badRequest,
  conflict,
  internalServerError,
} from "../../lib/errors";

export class TutorProfileNotFoundError extends DomainError {
  readonly domain = "tutor";
  constructor(id: string) {
    super("TUTOR_PROFILE_NOT_FOUND", "Tutor profile not found", { id });
  }
}

export class TutorProfileNotEditableError extends DomainError {
  readonly domain = "tutor";
  constructor(id: string, status: string) {
    super("TUTOR_PROFILE_NOT_EDITABLE", "Tutor profile is not editable", {
      id,
      status,
    });
  }
}

export class InvalidTutorStatusError extends DomainError {
  readonly domain = "tutor";
  constructor(id: string, status: string) {
    super("INVALID_TUTOR_STATUS", "Invalid tutor status for this action", {
      id,
      status,
    });
  }
}

export class AvailabilitySlotOverlapError extends DomainError {
  readonly domain = "tutor";
  constructor(tutorId: string) {
    super(
      "AVAILABILITY_SLOT_OVERLAP",
      "Availability slot overlaps with existing slot",
      { tutorId },
    );
  }
}

export class TutorProfileIncompleteError extends DomainError {
  readonly domain = "tutor";
  constructor(id: string, missingFields: string[]) {
    super(
      "TUTOR_PROFILE_INCOMPLETE",
      "All required fields must be filled before submission",
      { id, missingFields },
    );
  }
}

export class InvalidTutorPricingError extends DomainError {
  readonly domain = "tutor";
  constructor(id: string, pricingError: string) {
    super("INVALID_TUTOR_PRICING", "Tutor pricing validation failed", {
      id,
      pricingError,
    });
  }
}

export function mapTutorError(err: DomainError): ORPCError<string, undefined> {
  if (err instanceof TutorProfileNotFoundError)
    return notFound(err.message, err);
  if (err instanceof TutorProfileNotEditableError)
    return badRequest(err.message, err);
  if (err instanceof InvalidTutorStatusError) return conflict(err.message, err);
  if (err instanceof AvailabilitySlotOverlapError)
    return conflict(err.message, err);
  if (err instanceof TutorProfileIncompleteError)
    return badRequest(err.message, err);
  if (err instanceof InvalidTutorPricingError)
    return badRequest(err.message, err);
  return internalServerError(err.message, err);
}
