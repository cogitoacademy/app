import { notFound, badRequest } from "../../lib/errors";
import type { WalletSnapshot } from "../../shared/ports/wallet.port";

export type WalletValidationError =
  | ReturnType<typeof notFound>
  | ReturnType<typeof badRequest>;

export type WalletService = ReturnType<typeof createWalletService>;

export function createWalletService() {
  function validateHold(
    wallet: WalletSnapshot | null,
    amount: number,
  ): WalletValidationError | null {
    if (!wallet) return notFound("Wallet not found");
    if (wallet.availableBalance < amount) {
      return badRequest("Insufficient available balance");
    }
    return null;
  }

  function validateDeduct(
    wallet: WalletSnapshot | null,
  ): WalletValidationError | null {
    if (!wallet) return notFound("Wallet not found");
    return null;
  }

  return { validateHold, validateDeduct };
}
