import { expect, test } from "bun:test";
import { DomainError } from "../../lib/domain-errors";
import {
  CompetitionCatalogEntryNotFoundError,
  CompetitionCatalogInUseError,
  CompetitionCatalogInvalidOperationError,
  CompetitionCatalogSlugConflictError,
  CompetitionCatalogStateConflictError,
  CompetitionCatalogVersionConflictError,
  mapCompetitionCatalogError,
} from "../../modules/competition-catalog/competition-catalog.errors";

class UnexpectedCompetitionCatalogError extends DomainError {
  readonly domain = "competition-catalog";
  constructor() {
    super("UNEXPECTED", "Unexpected error");
  }
}

const mappings: Array<[DomainError, number]> = [
  [new CompetitionCatalogEntryNotFoundError("entry-1"), 404],
  [new CompetitionCatalogSlugConflictError("olympiad"), 409],
  [new CompetitionCatalogVersionConflictError("entry-1", 2, 3), 409],
  [new CompetitionCatalogInUseError("entry-1", { events: 1 }), 409],
  [new CompetitionCatalogStateConflictError("Entry is archived"), 409],
  [new CompetitionCatalogInvalidOperationError("Invalid operation"), 400],
  [new UnexpectedCompetitionCatalogError(), 500],
];

for (const [error, status] of mappings) {
  test(`maps ${error.name} to HTTP ${status}`, () => {
    expect(mapCompetitionCatalogError(error).status).toBe(status);
  });
}
