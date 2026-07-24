import { ORPCError } from "@orpc/server";
import { DomainError } from "../../lib/domain-errors";
import { notFound, conflict, internalServerError } from "../../lib/errors";

export class UserNotFoundError extends DomainError {
  readonly domain = "admin";
  constructor(id: string) {
    super("USER_NOT_FOUND", "User not found", { id });
  }
}

export class LastAdminError extends DomainError {
  readonly domain = "admin";
  constructor(id: string) {
    super("LAST_ADMIN", "Cannot remove the last admin", { id });
  }
}

export function mapAdminError(err: DomainError): ORPCError<string, undefined> {
  if (err instanceof UserNotFoundError) return notFound(err.message, err);
  if (err instanceof LastAdminError) return conflict(err.message, err);
  return internalServerError(err.message, err);
}
