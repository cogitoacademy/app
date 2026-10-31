import { ORPCError } from "@orpc/server";
import { DomainError } from "../../lib/domain-errors";
import {
  badRequest,
  conflict,
  internalServerError,
  notFound,
} from "../../lib/errors";
import { mapPaymentError } from "../payment/payment.errors";

export class ClassEnrollmentNotFoundError extends DomainError {
  readonly domain = "class-enrollment";

  constructor() {
    super("CLASS_ENROLLMENT_NOT_FOUND", "Class enrollment not found");
  }
}

export class ClassEnrollmentConflictError extends DomainError {
  readonly domain = "class-enrollment";

  constructor(message: string, details?: Record<string, unknown>) {
    super("CLASS_ENROLLMENT_CONFLICT", message, details);
  }
}

export class ClassEnrollmentInvalidOperationError extends DomainError {
  readonly domain = "class-enrollment";

  constructor(message: string, details?: Record<string, unknown>) {
    super("CLASS_ENROLLMENT_INVALID_OPERATION", message, details);
  }
}

export function mapClassEnrollmentError(
  err: DomainError,
): ORPCError<string, undefined> {
  if (err.domain === "payment") return mapPaymentError(err);
  if (err instanceof ClassEnrollmentNotFoundError)
    return notFound(err.message, err);
  if (err instanceof ClassEnrollmentConflictError)
    return conflict(err.message, err);
  if (err instanceof ClassEnrollmentInvalidOperationError)
    return badRequest(err.message, err);
  return internalServerError(err.message, err);
}
