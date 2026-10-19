import { ORPCError } from "@orpc/server";
import { DomainError } from "../../lib/domain-errors";
import {
  badRequest,
  conflict,
  internalServerError,
  notFound,
} from "../../lib/errors";

export class CompetitionCatalogEntryNotFoundError extends DomainError {
  readonly domain = "competition-catalog";

  constructor(id: string) {
    super("COMPETITION_CATALOG_ENTRY_NOT_FOUND", "Catalog entry not found", {
      id,
    });
  }
}

export class CompetitionCatalogSlugConflictError extends DomainError {
  readonly domain = "competition-catalog";

  constructor(slug: string) {
    super("COMPETITION_CATALOG_SLUG_CONFLICT", "Catalog slug already exists", {
      slug,
    });
  }
}

export class CompetitionCatalogVersionConflictError extends DomainError {
  readonly domain = "competition-catalog";

  constructor(id: string, expectedVersion: number, actualVersion: number) {
    super(
      "COMPETITION_CATALOG_VERSION_CONFLICT",
      "Catalog entry changed in another admin session. Reload and review it.",
      { id, expectedVersion, actualVersion },
    );
  }
}

export class CompetitionCatalogInvalidOperationError extends DomainError {
  readonly domain = "competition-catalog";

  constructor(message: string, details?: Record<string, unknown>) {
    super("COMPETITION_CATALOG_INVALID_OPERATION", message, details);
  }
}

export class CompetitionCatalogStateConflictError extends DomainError {
  readonly domain = "competition-catalog";

  constructor(message: string, details?: Record<string, unknown>) {
    super("COMPETITION_CATALOG_STATE_CONFLICT", message, details);
  }
}

export class CompetitionCatalogInUseError extends DomainError {
  readonly domain = "competition-catalog";

  constructor(id: string, references: Record<string, number>) {
    super(
      "COMPETITION_CATALOG_ENTRY_IN_USE",
      "This catalog entry is already in use. Archive it instead.",
      { id, references },
    );
  }
}

export function mapCompetitionCatalogError(
  err: DomainError,
): ORPCError<string, undefined> {
  if (err instanceof CompetitionCatalogEntryNotFoundError)
    return notFound(err.message, err);
  if (
    err instanceof CompetitionCatalogSlugConflictError ||
    err instanceof CompetitionCatalogVersionConflictError ||
    err instanceof CompetitionCatalogInUseError ||
    err instanceof CompetitionCatalogStateConflictError
  ) {
    return conflict(err.message, err);
  }
  if (err instanceof CompetitionCatalogInvalidOperationError)
    return badRequest(err.message, err);
  return internalServerError(err.message, err);
}
