import { ORPCError } from "@orpc/server";
import { DomainError } from "../../lib/domain-errors";
import { notFound, badRequest, internalServerError } from "../../lib/errors";

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

export function mapAuthError(err: DomainError): ORPCError<string, undefined> {
  if (err instanceof ProfileNotFoundError) return notFound(err.message, err);
  if (err instanceof ValidationRequiredError)
    return badRequest(err.message, err);
  return internalServerError(err.message, err);
}
