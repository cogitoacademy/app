import { adminProcedure } from "../../procedures";
import { createCorrectionInput, listCorrectionsInput } from "./refund.types";

export const refundRouter = {
  createCorrection: adminProcedure
    .route({
      method: "POST",
      path: "/admin/refund/correction",
      tags: ["Admin Refund"],
      summary: "Create a correction (compensate credit/deduct)",
      description:
        "Admin-only: creates a compensating ledger entry for wallet corrections",
    })
    .input(createCorrectionInput)
    .handler(async ({ context, input }) => {
      return context.services.refund.createCorrection(
        context.session.user.id,
        input,
      );
    }),

  listCorrections: adminProcedure
    .route({
      method: "POST",
      path: "/admin/refund/corrections",
      tags: ["Admin Refund"],
      summary: "List corrections for a wallet",
      description: "Returns compensating entries for a wallet",
    })
    .input(listCorrectionsInput)
    .handler(async ({ context, input }) => {
      return context.services.refund.listCorrections(input);
    }),
};
