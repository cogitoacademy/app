import { protectedProcedure } from "../../procedures";
import { createPurchaseInput, getPurchaseInput } from "./payment.types";

export const paymentRouter = {
  createPurchase: protectedProcedure
    .route({
      method: "POST",
      path: "/payment/purchase",
      tags: ["Payments"],
      summary: "Create purchase intent",
    })
    .input(createPurchaseInput)
    .handler(async ({ context, input }) => {
      const w = await context.services.wallet.getOrCreate(
        context.session!.user.id,
      );
      return context.services.payment.createIntent(
        context.session!.user.id,
        w.id,
        input.packageCode,
      );
    }),

  getPurchase: protectedProcedure
    .route({
      method: "POST",
      path: "/payment/get",
      tags: ["Payments"],
      summary: "Get purchase status",
    })
    .input(getPurchaseInput)
    .handler(async ({ context, input }) => {
      return context.services.payment.getPurchase(
        input.paymentId,
        context.session!.user.id,
      );
    }),
};
