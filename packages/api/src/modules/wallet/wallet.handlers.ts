import { env } from "@cogito-app/env/server";

import type { Context } from "../../context";

export const walletHandlers = {
  get: async ({ context }: { context: Context }) => {
    const w = await context.services.wallet.getOrCreate(
      context.session!.user.id,
    );
    return {
      id: w.id,
      totalBalance: w.totalBalance,
      heldBalance: w.heldBalance,
      availableBalance: w.availableBalance,
    };
  },

  listLedger: async ({ context, input }: { context: Context; input: any }) => {
    const w = await context.services.wallet.getOrCreate(
      context.session!.user.id,
    );
    return context.services.wallet.listLedger(w.id, input);
  },

  listPackages: async ({ context }: { context: Context }) => {
    return context.services.wallet.listActivePackages();
  },

  knowledgeBankEligible: async ({ context }: { context: Context }) => {
    return context.services.wallet.knowledgeBankEligible(
      context.session!.user.id,
    );
  },

  competitionCalendarLink: async () => {
    return { url: env.COMPETITION_CALENDAR_URL };
  },
};
