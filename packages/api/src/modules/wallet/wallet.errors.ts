import { ORPCError } from "@orpc/server";
import { DomainError } from "../../lib/domain-errors";
import { notFound, badRequest, internalServerError } from "../../lib/errors";

export class WalletNotFoundError extends DomainError {
  readonly domain = "wallet";
  constructor(walletId: string) {
    super("WALLET_NOT_FOUND", "Wallet not found", { walletId });
  }
}

export class InsufficientBalanceError extends DomainError {
  readonly domain = "wallet";
  constructor(available: number, required: number) {
    super("INSUFFICIENT_BALANCE", "Insufficient balance", {
      available,
      required,
    });
  }
}

export function mapWalletError(err: DomainError): ORPCError<string, undefined> {
  if (err instanceof WalletNotFoundError) return notFound(err.message, err);
  if (err instanceof InsufficientBalanceError)
    return badRequest(err.message, err);
  return internalServerError(err.message, err);
}
