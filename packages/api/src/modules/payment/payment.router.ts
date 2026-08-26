import { protectedProcedure, verifiedProcedure } from "../../procedures";
import { createPurchaseInput, getPurchaseInput } from "./payment.types";
import type { PaymentHandler } from "./payment.handler";

export function createPaymentRouter(handler: PaymentHandler) {
  return {
    createPurchase: verifiedProcedure
      .route({
        method: "POST",
        path: "/payment/purchase",
        tags: ["Payments"],
        summary: "Create purchase intent",
      })
      .input(createPurchaseInput)
      .handler(handler.createPurchase),

    getPurchase: protectedProcedure
      .route({
        method: "POST",
        path: "/payment/get",
        tags: ["Payments"],
        summary: "Get purchase status",
      })
      .input(getPurchaseInput)
      .handler(handler.getPurchase),
  };
}
