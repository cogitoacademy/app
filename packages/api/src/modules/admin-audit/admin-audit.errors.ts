import { ORPCError } from "@orpc/server";

import { DomainError } from "../../lib/domain-errors";
import { badRequest, internalServerError } from "../../lib/errors";

export class InvalidAuditDateRangeError extends DomainError {
  readonly domain = "admin-audit";

  constructor() {
    super(
      "INVALID_AUDIT_DATE_RANGE",
      "The start date cannot be after the end date",
    );
  }
}

export class InvalidAuditCursorError extends DomainError {
  readonly domain = "admin-audit";

  constructor() {
    super("INVALID_AUDIT_CURSOR", "The audit log cursor is not valid");
  }
}

export function mapAdminAuditError(
  err: DomainError,
): ORPCError<string, undefined> {
  if (err instanceof InvalidAuditDateRangeError)
    return badRequest(err.message, err);
  if (err instanceof InvalidAuditCursorError)
    return badRequest(err.message, err);
  return internalServerError(err.message, err);
}
