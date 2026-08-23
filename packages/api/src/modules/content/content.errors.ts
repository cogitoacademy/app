import { ORPCError } from "@orpc/server";

import { DomainError } from "../../lib/domain-errors";
import { internalServerError } from "../../lib/errors";

export function mapContentError(
  err: DomainError,
): ORPCError<string, undefined> {
  return internalServerError(err.message, err);
}
