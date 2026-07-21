import type { Context } from "../../context";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { internalServerError } from "../../lib/errors";
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
      try {
        const w = await wallet.getOrCreate(context.session!.user.id);
        return {
          id: w.id,
          totalBalance: w.totalBalance,
          heldBalance: w.heldBalance,
          availableBalance: w.availableBalance,
        };
      } catch (err) {
        if (err instanceof ORPCError) throw err;
        throw internalServerError("Failed to fetch wallet", err);
      }
    },

    listLedger: async ({
      context,
      input,
    }: {
      context: Context;
      input: ListLedgerInput;
    }) => {
      try {
        const w = await wallet.getOrCreate(context.session!.user.id);
        return wallet.listLedger(w.id, input);
      } catch (err) {
        if (err instanceof ORPCError) throw err;
        throw internalServerError("Failed to list ledger entries", err);
      }
    },

    listPackages: async ({ context: _context }: { context: Context }) => {
      try {
        return wallet.listActivePackages();
      } catch (err) {
        if (err instanceof ORPCError) throw err;
        throw internalServerError("Failed to list packages", err);
      }
    },

    knowledgeBankEligible: async ({ context }: { context: Context }) => {
      try {
        return wallet.knowledgeBankEligible(context.session!.user.id);
      } catch (err) {
        if (err instanceof ORPCError) throw err;
        throw internalServerError(
          "Failed to check knowledge bank eligibility",
          err,
        );
      }
    },

    competitionCalendarLink: async () => {
      try {
        return { url: competitionCalendarUrl };
      } catch (err) {
        if (err instanceof ORPCError) throw err;
        throw internalServerError(
          "Failed to fetch competition calendar link",
          err,
        );
      }
    },
  };
}
