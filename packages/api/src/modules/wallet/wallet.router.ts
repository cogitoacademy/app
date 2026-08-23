import { protectedProcedure, studentProcedure } from "../../procedures";
import { listLedgerInput } from "./wallet.types";
import type { WalletHandler } from "./wallet.handler";

export function createWalletRouter(handler: WalletHandler) {
  return {
    get: protectedProcedure
      .route({
        method: "POST",
        path: "/wallet/get",
        tags: ["Wallet"],
        summary: "Get wallet",
      })
      .handler(handler.get),

    listLedger: protectedProcedure
      .route({
        method: "POST",
        path: "/wallet/ledger",
        tags: ["Wallet"],
        summary: "List ledger entries",
      })
      .input(listLedgerInput)
      .handler(handler.listLedger),

    listPackages: protectedProcedure
      .route({
        method: "POST",
        path: "/wallet/packages",
        tags: ["Wallet"],
        summary: "List mark packages",
      })
      .handler(handler.listPackages),

    // M9: PRD FR-12 is student-facing — tutors/admins with >= threshold Marks
    // must not pass the Knowledge Bank gate.
    knowledgeBankEligible: studentProcedure
      .route({
        method: "POST",
        path: "/wallet/knowledge-bank",
        tags: ["Wallet"],
        summary: "Knowledge Bank eligibility",
      })
      .handler(handler.knowledgeBankEligible),
  };
}
