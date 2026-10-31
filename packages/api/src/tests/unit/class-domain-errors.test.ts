import { expect, test } from "bun:test";
import { DomainError } from "../../lib/domain-errors";
import {
  AcademyClassInvalidOperationError,
  AcademyClassNotFoundError,
  AcademyClassStateConflictError,
  AcademyClassVersionConflictError,
  mapAcademyClassError,
} from "../../modules/academy-class/academy-class.errors";
import {
  ClassEnrollmentConflictError,
  ClassEnrollmentInvalidOperationError,
  ClassEnrollmentNotFoundError,
  mapClassEnrollmentError,
} from "../../modules/class-enrollment/class-enrollment.errors";
import { PaymentNotFoundError } from "../../modules/payment/payment.errors";

class UnexpectedClassError extends DomainError {
  readonly domain = "unexpected";
  constructor() {
    super("UNEXPECTED", "Unexpected class error");
  }
}

const enrollmentMappings: Array<[DomainError, number]> = [
  [new ClassEnrollmentNotFoundError(), 404],
  [new ClassEnrollmentConflictError("Stale enrollment"), 409],
  [new ClassEnrollmentInvalidOperationError("Invalid enrollment"), 400],
  [new PaymentNotFoundError("payment-1"), 404],
  [new UnexpectedClassError(), 500],
];

for (const [error, status] of enrollmentMappings) {
  test(`maps ${error.name} to HTTP ${status} for class enrollment`, () => {
    expect(mapClassEnrollmentError(error).status).toBe(status);
  });
}

const academyMappings: Array<[DomainError, number]> = [
  [new AcademyClassNotFoundError("class-1"), 404],
  [new AcademyClassVersionConflictError("class-1", 1, 2), 409],
  [new AcademyClassStateConflictError("Invalid state"), 409],
  [new AcademyClassInvalidOperationError("Invalid class"), 400],
  [new UnexpectedClassError(), 500],
];

for (const [error, status] of academyMappings) {
  test(`maps ${error.name} to HTTP ${status} for academy class`, () => {
    expect(mapAcademyClassError(error).status).toBe(status);
  });
}
