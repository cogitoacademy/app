import { protectedProcedure } from "../../procedures";
import { env } from "@cogito-app/env/server";
import { listLedgerInput } from "./wallet.types";

export const walletRouter = {
  get: protectedProcedure
    .route({
      method: "POST",
      path: "/wallet/get",
      tags: ["Wallet"],
      summary: "Get wallet",
    })
    .handler(async ({ context }) => {
      const w = await context.services.wallet.getOrCreate(
        context.session!.user.id,
      );
      return {
        id: w.id,
        totalBalance: w.totalBalance,
        heldBalance: w.heldBalance,
        availableBalance: w.availableBalance,
      };
    }),

  listLedger: protectedProcedure
    .route({
      method: "POST",
      path: "/wallet/ledger",
      tags: ["Wallet"],
      summary: "List ledger entries",
    })
    .input(listLedgerInput)
    .handler(async ({ context, input }) => {
      const w = await context.services.wallet.getOrCreate(
        context.session!.user.id,
      );
      return context.services.wallet.listLedger(w.id, input);
    }),

  listPackages: protectedProcedure
    .route({
      method: "POST",
      path: "/wallet/packages",
      tags: ["Wallet"],
      summary: "List mark packages",
    })
    .handler(async ({ context }) => {
      return context.services.wallet.listActivePackages();
    }),

  knowledgeBankEligible: protectedProcedure
    .route({
      method: "POST",
      path: "/wallet/knowledge-bank",
      tags: ["Wallet"],
      summary: "Knowledge Bank eligibility",
    })
    .handler(async ({ context }) => {
      return context.services.wallet.knowledgeBankEligible(
        context.session!.user.id,
      );
    }),

  competitionCalendarLink: protectedProcedure
    .route({
      method: "POST",
      path: "/wallet/competition-calendar",
      tags: ["Wallet"],
      summary: "Competition calendar link",
    })
    .handler(() => {
      return { url: env.COMPETITION_CALENDAR_URL };
    }),
};
