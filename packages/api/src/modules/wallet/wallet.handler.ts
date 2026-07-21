import type { Context } from "../../context";
import type { z } from "zod";
import type { listLedgerInput } from "./wallet.types";
import type { WalletService } from "./wallet.service";

type ListLedgerInput = z.infer<typeof listLedgerInput>;

export type WalletHandler = ReturnType<typeof createWalletHandler>;

interface WalletHandlerDeps {
  wallet: WalletService;
  competitionCalendarUrl: string;
}

export function createWalletHandler({
  wallet,
  competitionCalendarUrl,
}: WalletHandlerDeps) {
  return {
    get: async ({ context }: { context: Context }) => {
      const w = await wallet.getOrCreate(context.session!.user.id);
      return {
        id: w.id,
        totalBalance: w.totalBalance,
        heldBalance: w.heldBalance,
        availableBalance: w.availableBalance,
      };
    },

    listLedger: async ({
      context,
      input,
    }: {
      context: Context;
      input: ListLedgerInput;
    }) => {
      const w = await wallet.getOrCreate(context.session!.user.id);
      return wallet.listLedger(w.id, input);
    },

    listPackages: async ({ context: _context }: { context: Context }) => {
      return wallet.listActivePackages();
    },

    knowledgeBankEligible: async ({ context }: { context: Context }) => {
      return wallet.knowledgeBankEligible(context.session!.user.id);
    },

    // TODO: Move to a dedicated config module — this is not a wallet concern
    competitionCalendarLink: async () => {
      return { url: competitionCalendarUrl };
    },
  };
}
