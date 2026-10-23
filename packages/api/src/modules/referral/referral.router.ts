import { z } from "zod";
import {
  adminProcedure,
  publicProcedure,
  requireAuth,
  verifiedStudentProcedure,
} from "../../procedures";
import type { ReferralHandler } from "./referral.handler";
import {
  exportKolMonthlyInput,
  getKolSettlementInput,
  recordKolTransferInput,
  adjustKolCommissionInput,
  createKolCampaignInput,
  listKolCommissionsInput,
  saveGoogleChoiceInput,
  updateReferralSettingsInput,
} from "./referral.types";

export function createReferralRouter(handler: ReferralHandler) {
  return {
    referral: {
      saveGoogleChoice: publicProcedure
        .use(requireAuth)
        .route({
          method: "POST",
          path: "/referral/save-google-choice",
          tags: ["Referral"],
          summary: "Save the pending Google signup referral choice",
        })
        .input(saveGoogleChoiceInput)
        .handler(handler.saveGoogleChoice),

      getMine: verifiedStudentProcedure
        .route({
          method: "POST",
          path: "/referral/mine",
          tags: ["Referral"],
          summary: "Get the current student's referral code and semester total",
        })
        .input(z.void())
        .handler(handler.getMine),
    },

    adminReferral: {
      exportKolMonthly: adminProcedure
        .route({
          method: "POST",
          path: "/admin/referral/kol/export-monthly",
          tags: ["Admin", "Referral"],
          summary: "Export current KOL reconciliation for a WIB activity month",
        })
        .input(exportKolMonthlyInput)
        .handler(handler.exportKolMonthly),
      getKolSettlement: adminProcedure
        .route({
          method: "POST",
          path: "/admin/referral/kol/settlement",
          tags: ["Admin", "Referral"],
          summary: "Get commission balances and immutable settlement history",
        })
        .input(getKolSettlementInput)
        .handler(handler.getKolSettlement),
      recordKolTransfer: adminProcedure
        .route({
          method: "POST",
          path: "/admin/referral/kol/transfers/record",
          tags: ["Admin", "Referral"],
          summary: "Record an actual external KOL transfer",
        })
        .input(recordKolTransferInput)
        .handler(handler.recordKolTransfer),
      adjustKolCommission: adminProcedure
        .route({
          method: "POST",
          path: "/admin/referral/kol/adjustments/record",
          tags: ["Admin", "Referral"],
          summary: "Record a reasoned KOL obligation adjustment",
        })
        .input(adjustKolCommissionInput)
        .handler(handler.adjustKolCommission),
      getSettings: adminProcedure
        .route({
          method: "POST",
          path: "/admin/referral/settings",
          tags: ["Admin", "Referral"],
          summary: "Get active referral reward settings",
        })
        .input(z.void())
        .handler(handler.getSettings),

      updateSettings: adminProcedure
        .route({
          method: "POST",
          path: "/admin/referral/settings/update",
          tags: ["Admin", "Referral"],
          summary: "Create an audited referral settings revision",
        })
        .input(updateReferralSettingsInput)
        .handler(handler.updateSettings),

      createKolCampaign: adminProcedure
        .route({
          method: "POST",
          path: "/admin/referral/kol-campaigns/create",
          tags: ["Admin", "Referral"],
          summary: "Create a KOL signup code with immutable commission terms",
        })
        .input(createKolCampaignInput)
        .handler(handler.createKolCampaign),

      listKolCampaigns: adminProcedure
        .route({
          method: "POST",
          path: "/admin/referral/kol-campaigns/list",
          tags: ["Admin", "Referral"],
          summary: "List KOL signup campaigns and their codes",
        })
        .input(z.void())
        .handler(handler.listKolCampaigns),

      listKolCommissions: adminProcedure
        .route({
          method: "POST",
          path: "/admin/referral/kol-commissions/list",
          tags: ["Admin", "Referral"],
          summary: "List first-purchase KOL commission decisions",
        })
        .input(listKolCommissionsInput)
        .handler(handler.listKolCommissions),
    },
  };
}
