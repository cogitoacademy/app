import { ORPCError } from "@orpc/server";
import { DomainError } from "../../lib/domain-errors";
import { notFound, internalServerError } from "../../lib/errors";

export class TutorProfileNotFoundError extends DomainError {
  readonly domain = "discovery";
  constructor(id: string) {
    super("DISCOVERY_TUTOR_NOT_FOUND", "Tutor profile not found", { id });
  }
}

export function mapDiscoveryError(
  err: DomainError,
): ORPCError<string, undefined> {
  if (err instanceof TutorProfileNotFoundError)
    return notFound(err.message, err);
  return internalServerError(err.message, err);
}
