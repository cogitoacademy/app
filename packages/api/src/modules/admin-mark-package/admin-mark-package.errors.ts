import { ORPCError } from "@orpc/server";
import { DomainError } from "../../lib/domain-errors";
import { conflict, internalServerError, notFound } from "../../lib/errors";

export class MarkPackageNotFoundError extends DomainError {
  readonly domain = "admin-mark-package";

  constructor(id: string) {
    super("MARK_PACKAGE_NOT_FOUND", "Mark package not found", { id });
  }
}

export class MarkPackageCodeConflictError extends DomainError {
  readonly domain = "admin-mark-package";

  constructor(code: string) {
    super("MARK_PACKAGE_CODE_CONFLICT", "Mark package code already exists", {
      code,
    });
  }
}

export function mapAdminMarkPackageError(
  err: DomainError,
): ORPCError<string, undefined> {
  if (err instanceof MarkPackageNotFoundError)
    return notFound(err.message, err);
  if (err instanceof MarkPackageCodeConflictError)
    return conflict(err.message, err);
  return internalServerError(err.message, err);
}
