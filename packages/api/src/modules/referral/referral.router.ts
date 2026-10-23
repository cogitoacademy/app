import { z } from "zod";
import {
  adminProcedure,
  publicProcedure,
  requireAuth,
  verifiedStudentProcedure,
} from "../../procedures";
import type { ReferralHandler } from "./referral.handler";
import {
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
