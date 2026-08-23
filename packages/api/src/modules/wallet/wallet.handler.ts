import type { Context } from "../../context";
import { z } from "zod";
import { withDomainMap } from "../../lib/handler-utils";
import { mapWalletError } from "./wallet.errors";
import type { listLedgerInput } from "./wallet.types";
import type { WalletService } from "./wallet.service";

type ListLedgerInput = z.infer<typeof listLedgerInput>;

export type WalletHandler = ReturnType<typeof createWalletHandler>;

interface WalletHandlerDeps {
  wallet: WalletService;
}

export function createWalletHandler({ wallet }: WalletHandlerDeps) {
  return {
    get: async ({ context }: { context: Context }) => {
      return withDomainMap(async () => {
        const w = await wallet.getOrCreate(context.session!.user.id);
        return {
          id: w.id,
          totalBalance: w.totalBalance,
          heldBalance: w.heldBalance,
          availableBalance: w.availableBalance,
        };
      }, mapWalletError);
    },

    listLedger: async ({
      context,
      input,
    }: {
      context: Context;
      input: ListLedgerInput;
    }) => {
      return withDomainMap(async () => {
        const w = await wallet.getOrCreate(context.session!.user.id);
        return wallet.listLedger(w.id, input);
      }, mapWalletError);
    },

    listPackages: async ({ context: _context }: { context: Context }) => {
      return withDomainMap(async () => {
        return wallet.listActivePackages();
      }, mapWalletError);
    },

    knowledgeBankEligible: async ({ context }: { context: Context }) => {
      return withDomainMap(async () => {
        return wallet.knowledgeBankEligible(context.session!.user.id);
      }, mapWalletError);
    },
  };
}
