import { protectedProcedure } from "../../procedures";
import { listLedgerInput } from "./wallet.types";
import { walletHandlers } from "./wallet.handlers";

export const walletRouter = {
  get: protectedProcedure
    .route({
      method: "POST",
      path: "/wallet/get",
      tags: ["Wallet"],
      summary: "Get wallet",
    })
    .handler(walletHandlers.get),

  listLedger: protectedProcedure
    .route({
      method: "POST",
      path: "/wallet/ledger",
      tags: ["Wallet"],
      summary: "List ledger entries",
    })
    .input(listLedgerInput)
    .handler(walletHandlers.listLedger),

  listPackages: protectedProcedure
    .route({
      method: "POST",
      path: "/wallet/packages",
      tags: ["Wallet"],
      summary: "List mark packages",
    })
    .handler(walletHandlers.listPackages),

  knowledgeBankEligible: protectedProcedure
    .route({
      method: "POST",
      path: "/wallet/knowledge-bank",
      tags: ["Wallet"],
      summary: "Knowledge Bank eligibility",
    })
    .handler(walletHandlers.knowledgeBankEligible),

  competitionCalendarLink: protectedProcedure
    .route({
      method: "POST",
      path: "/wallet/competition-calendar",
      tags: ["Wallet"],
      summary: "Competition calendar link",
    })
    .handler(walletHandlers.competitionCalendarLink),
};
