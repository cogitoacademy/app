import { ORPCError } from "@orpc/server";

import { DomainError } from "../../lib/domain-errors";
import {
  badRequest,
  conflict,
  internalServerError,
  notFound,
} from "../../lib/errors";

export class FaqNotFoundError extends DomainError {
  readonly domain = "faq";

  constructor(id: string) {
    super("FAQ_NOT_FOUND", "FAQ entry not found", { id });
  }
}

export class FaqLandingLimitError extends DomainError {
  readonly domain = "faq";

  constructor() {
    super(
      "LANDING_FAQ_LIMIT",
      "Choose up to 6 active FAQs for the landing page.",
    );
  }
}

export class FaqVersionConflictError extends DomainError {
  readonly domain = "faq";

  constructor(id: string, expectedVersion: number, actualVersion: number) {
    super(
      "VERSION_CONFLICT",
      "FAQ changed in another admin session. Reload and review it.",
      { id, expectedVersion, actualVersion },
    );
  }
}

export function mapFaqError(err: DomainError): ORPCError<string, undefined> {
  if (err instanceof FaqNotFoundError) return notFound(err.message, err);
  if (err instanceof FaqLandingLimitError) return badRequest(err.message, err);
  if (err instanceof FaqVersionConflictError) return conflict(err.message, err);
  return internalServerError(err.message, err);
}
