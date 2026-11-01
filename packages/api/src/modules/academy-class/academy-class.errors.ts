import { ORPCError } from "@orpc/server";
import { DomainError } from "../../lib/domain-errors";
import {
  badRequest,
  conflict,
  internalServerError,
  notFound,
} from "../../lib/errors";

export class AcademyClassNotFoundError extends DomainError {
  readonly domain = "academy-class";

  constructor(id: string) {
    super("ACADEMY_CLASS_NOT_FOUND", "Class not found", { id });
  }
}

export class AcademyClassVersionConflictError extends DomainError {
  readonly domain = "academy-class";

  constructor(id: string, expectedVersion: number, actualVersion: number) {
    super(
      "ACADEMY_CLASS_VERSION_CONFLICT",
      "Class draft changed in another admin session. Reload and review it.",
      { id, expectedVersion, actualVersion },
    );
  }
}

export class AcademyClassStateConflictError extends DomainError {
  readonly domain = "academy-class";

  constructor(message: string, details?: Record<string, unknown>) {
    super("ACADEMY_CLASS_STATE_CONFLICT", message, details);
  }
}

export class AcademyClassInvalidOperationError extends DomainError {
  readonly domain = "academy-class";

  constructor(message: string, details?: Record<string, unknown>) {
    super("ACADEMY_CLASS_INVALID_OPERATION", message, details);
  }
}

export function mapAcademyClassError(
  err: DomainError,
): ORPCError<string, undefined> {
  if (err instanceof AcademyClassNotFoundError)
    return notFound(err.message, err);
  if (
    err instanceof AcademyClassVersionConflictError ||
    err instanceof AcademyClassStateConflictError
  ) {
    return conflict(err.message, err);
  }
  if (err instanceof AcademyClassInvalidOperationError)
    return badRequest(err.message, err);
  return internalServerError(err.message, err);
}
