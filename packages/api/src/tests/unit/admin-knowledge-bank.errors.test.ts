import { expect, test } from "bun:test";
import { DomainError } from "../../lib/domain-errors";
import {
  InvalidKnowledgeBankAccessExpiryError,
  KnowledgeBankAccessGrantAlreadyExistsError,
  KnowledgeBankAccessGrantNotFoundError,
  mapAdminKnowledgeBankError,
  StudentNotFoundError,
  TargetUserNotStudentError,
} from "../../modules/admin-knowledge-bank/admin-knowledge-bank.errors";

class UnexpectedAdminKnowledgeBankError extends DomainError {
  readonly domain = "admin-knowledge-bank";
  constructor() {
    super("UNEXPECTED", "Unexpected error");
  }
}

const mappings: Array<[DomainError, number]> = [
  [new StudentNotFoundError("student@example.test"), 404],
  [new KnowledgeBankAccessGrantNotFoundError("grant-1"), 404],
  [new TargetUserNotStudentError("tutor@example.test"), 400],
  [new InvalidKnowledgeBankAccessExpiryError(), 400],
  [new KnowledgeBankAccessGrantAlreadyExistsError("user-1"), 409],
  [new UnexpectedAdminKnowledgeBankError(), 500],
];

for (const [error, status] of mappings) {
  test(`maps ${error.name} to HTTP ${status}`, () => {
    expect(mapAdminKnowledgeBankError(error).status).toBe(status);
  });
}
