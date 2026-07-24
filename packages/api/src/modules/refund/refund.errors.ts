import { ORPCError } from "@orpc/server";
import { DomainError } from "../../lib/domain-errors";
import { notFound, badRequest, internalServerError } from "../../lib/errors";

export class WalletNotFoundError extends DomainError {
  readonly domain = "refund";
  constructor(walletId: string) {
    super("WALLET_NOT_FOUND", "Wallet not found", { walletId });
  }
}

export class InvalidRefundAmountError extends DomainError {
  readonly domain = "refund";
  constructor(amount: number, reason: string) {
    super("INVALID_REFUND_AMOUNT", "Invalid refund amount", { amount, reason });
  }
}

export function mapRefundError(err: DomainError): ORPCError<string, undefined> {
  if (err instanceof WalletNotFoundError) return notFound(err.message, err);
  if (err instanceof InvalidRefundAmountError)
    return badRequest(err.message, err);
  return internalServerError(err.message, err);
}
