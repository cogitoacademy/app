import { ORPCError } from "@orpc/server";
import { DomainError } from "../../lib/domain-errors";
import {
  notFound,
  badRequest,
  forbidden,
  internalServerError,
} from "../../lib/errors";

export class ProfileNotFoundError extends DomainError {
  readonly domain = "auth";
  constructor(userId: string) {
    super("PROFILE_NOT_FOUND", "Profile not found", { userId });
  }
}

export class ValidationRequiredError extends DomainError {
  readonly domain = "auth";
  constructor(userId: string) {
    super("VALIDATION_REQUIRED", "Account validation required", { userId });
  }
}

export class StudentSearchForbiddenError extends DomainError {
  readonly domain = "auth";
  constructor(userId: string) {
    super(
      "STUDENT_SEARCH_FORBIDDEN",
      "Student search is only available to students",
      {
        userId,
      },
    );
  }
}

export function mapAuthError(err: DomainError): ORPCError<string, undefined> {
  if (err instanceof ProfileNotFoundError) return notFound(err.message, err);
  if (err instanceof ValidationRequiredError)
    return badRequest(err.message, err);
  if (err instanceof StudentSearchForbiddenError)
    return forbidden(err.message, err);
  return internalServerError(err.message, err);
}
