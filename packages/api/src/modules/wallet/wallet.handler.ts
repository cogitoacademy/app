import type { Context } from "../../context";
import { z } from "zod";
import { withDomainMap } from "../../lib/handler-utils";
import { mapWalletError } from "./wallet.errors";
import type { listLedgerInput } from "./wallet.types";
import type { WalletService } from "./wallet.service";
import type { XenditMode } from "../payment/xendit-payment.provider";

type ListLedgerInput = z.infer<typeof listLedgerInput>;

export type WalletHandler = ReturnType<typeof createWalletHandler>;

interface WalletHandlerDeps {
  wallet: WalletService;
  // Client-visible payment mode signal (Xendit Test Mode vs Live Mode vs
  // stub). Passed through on listPackages so the web app can label packages
  // that exceed the Xendit Test Mode amount cap.
  xenditMode?: XenditMode;
}

export function createWalletHandler({ wallet, xenditMode }: WalletHandlerDeps) {
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
        return {
          xenditMode: xenditMode ?? null,
          packages: await wallet.listActivePackages(),
        };
      }, mapWalletError);
    },

    knowledgeBankEligible: async ({ context }: { context: Context }) => {
      return withDomainMap(async () => {
        const user = context.session!.user as { id: string; role?: string };
        return wallet.knowledgeBankEligible(user.id, user.role);
      }, mapWalletError);
    },
  };
}
