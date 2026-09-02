import { ORPCError } from "@orpc/server";
import { DomainError } from "../../lib/domain-errors";
import {
  notFound,
  badRequest,
  conflict,
  internalServerError,
} from "../../lib/errors";
import { InvalidTutorSubjectSelectionError } from "../tutor-subjects/subject-selection";

export { InvalidTutorSubjectSelectionError } from "../tutor-subjects/subject-selection";

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

export class WeeklyAvailabilityRangeError extends DomainError {
  readonly domain = "tutor";
  constructor() {
    super(
      "WEEKLY_AVAILABILITY_RANGE_INVALID",
      "Weekly availability can be scheduled for up to 52 weeks",
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

export class OptimisticLockError extends DomainError {
  readonly domain = "tutor";
  constructor(id: string, expectedVersion: number) {
    super("OPTIMISTIC_LOCK", "Resource was modified by another transaction", {
      id,
      expectedVersion,
    });
  }
}

function badRequestWithTutorDetails(err: DomainError) {
  const details = err.details ?? {};
  const data = Object.fromEntries(
    Object.entries(details).filter(([key]) => key !== "id"),
  );
  return new ORPCError("BAD_REQUEST", {
    message: err.message,
    data,
  });
}

export class InvalidDateRangeError extends DomainError {
  readonly domain = "tutor";
  constructor(field: string) {
    super("INVALID_DATE_RANGE", `${field} must be a valid ISO datetime`, {
      field,
    });
  }
}

export function mapTutorError(err: DomainError): ORPCError<string, unknown> {
  if (err instanceof TutorProfileNotFoundError)
    return notFound(err.message, err);
  if (err instanceof TutorProfileNotEditableError)
    return badRequest(err.message, err);
  if (err instanceof InvalidTutorStatusError) return conflict(err.message, err);
  if (err instanceof AvailabilitySlotOverlapError)
    return conflict(err.message, err);
  if (err instanceof WeeklyAvailabilityRangeError)
    return badRequest(err.message, err);
  if (err instanceof TutorProfileIncompleteError)
    return badRequestWithTutorDetails(err);
  if (err instanceof InvalidTutorPricingError)
    return badRequestWithTutorDetails(err);
  if (err instanceof InvalidTutorSubjectSelectionError)
    return badRequestWithTutorDetails(err);
  if (err instanceof OptimisticLockError) return conflict(err.message, err);
  if (err instanceof InvalidDateRangeError) return badRequest(err.message, err);
  return internalServerError(err.message, err);
}
