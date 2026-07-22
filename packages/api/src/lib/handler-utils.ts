import { ORPCError } from "@orpc/server";
import { DomainError } from "./domain-errors";
import { internalServerError } from "./errors";

/**
 * Wraps a handler function, catching DomainErrors and mapping them to ORPCError HTTP responses.
 * ORPCError passes through unchanged; unknown errors become internalServerError.
 */
export function withDomainMap<T>(
  fn: () => Promise<T>,
  mapper: (err: DomainError) => ORPCError<string, unknown>,
): Promise<T> {
  return fn().catch((err) => {
    if (err instanceof ORPCError) throw err;
    if (err instanceof DomainError) throw mapper(err);
    throw internalServerError("Unexpected error", err);
  });
}
