import { protectedProcedure, verifiedStudentProcedure } from "../../procedures";
import { createPurchaseInput, getPurchaseInput } from "./payment.types";
import type { PaymentHandler } from "./payment.handler";

export function createPaymentRouter(handler: PaymentHandler) {
  return {
    createPurchase: verifiedStudentProcedure
      .route({
        method: "POST",
        path: "/payment/purchase",
        tags: ["Payments"],
        summary: "Create purchase intent",
        description:
          "Creates a purchase intent for a Marks package (requires a verified email)",
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
