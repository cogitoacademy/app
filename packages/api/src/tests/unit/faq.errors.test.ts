import { expect, test } from "bun:test";
import { DomainError } from "../../lib/domain-errors";
import {
  FaqLandingLimitError,
  FaqNotFoundError,
  FaqVersionConflictError,
  mapFaqError,
} from "../../modules/faq/faq.errors";

class UnexpectedFaqError extends DomainError {
  readonly domain = "faq";
  constructor() {
    super("UNEXPECTED", "Unexpected error");
  }
}

const mappings: Array<[DomainError, number]> = [
  [new FaqNotFoundError("faq-1"), 404],
  [new FaqLandingLimitError(), 400],
  [new FaqVersionConflictError("faq-1", 2, 3), 409],
  [new UnexpectedFaqError(), 500],
];

for (const [error, status] of mappings) {
  test(`maps ${error.name} to HTTP ${status}`, () => {
    expect(mapFaqError(error).status).toBe(status);
  });
}
