import { ORPCError } from "@orpc/server";
import { DomainError } from "../../lib/domain-errors";
import {
  notFound,
  conflict,
  badRequest,
  internalServerError,
} from "../../lib/errors";

export class UserNotFoundError extends DomainError {
  readonly domain = "admin";
  constructor(id: string) {
    super("USER_NOT_FOUND", "User not found", { id });
  }
}

export class LastAdminError extends DomainError {
  readonly domain = "admin";
  constructor(id: string) {
    super("LAST_ADMIN", "Cannot remove the last admin", { id });
  }
}

export class OptimisticLockError extends DomainError {
  readonly domain = "admin";
  constructor(id: string, expectedRole: string) {
    super("OPTIMISTIC_LOCK", "Resource was modified by another transaction", {
      id,
      expectedRole,
    });
  }
}

export class WalletNotFoundError extends DomainError {
  readonly domain = "admin";
  constructor(userId: string) {
    super("WALLET_NOT_FOUND", "Wallet not found for user", { userId });
  }
}

export class InvalidLedgerFilterError extends DomainError {
  readonly domain = "admin";
  constructor(message: string) {
    super("INVALID_LEDGER_FILTER", message);
  }
}

export class EconomyConfigConflictError extends DomainError {
  readonly domain = "admin";
  constructor(expectedVersion: number) {
    super(
      "ECONOMY_CONFIG_CONFLICT",
      "Economy settings were updated by another admin",
      {
        expectedVersion,
      },
    );
  }
}

export function mapAdminError(err: DomainError): ORPCError<string, undefined> {
  if (err instanceof UserNotFoundError) return notFound(err.message, err);
  if (err instanceof WalletNotFoundError) return notFound(err.message, err);
  if (err instanceof LastAdminError) return conflict(err.message, err);
  if (err instanceof OptimisticLockError) return conflict(err.message, err);
  if (err instanceof InvalidLedgerFilterError)
    return badRequest(err.message, err);
  if (err instanceof EconomyConfigConflictError)
    return conflict(err.message, err);
  return internalServerError(err.message, err);
}
