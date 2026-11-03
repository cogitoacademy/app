import { ORPCError } from "@orpc/server";

import { DomainError } from "../../lib/domain-errors";
import { badRequest, internalServerError } from "../../lib/errors";

export class InvalidPaymentFilterError extends DomainError {
  readonly domain = "admin-payment";

  constructor(message: string) {
    super("INVALID_PAYMENT_FILTER", message);
  }
}

export class InvalidPaymentCursorError extends DomainError {
  readonly domain = "admin-payment";

  constructor() {
    super("INVALID_PAYMENT_CURSOR", "The payment list cursor is invalid");
  }
}

export function mapAdminPaymentError(
  err: DomainError,
): ORPCError<string, undefined> {
  if (err instanceof InvalidPaymentFilterError)
    return badRequest(err.message, err);
  if (err instanceof InvalidPaymentCursorError)
    return badRequest(err.message, err);
  return internalServerError(err.message, err);
}
