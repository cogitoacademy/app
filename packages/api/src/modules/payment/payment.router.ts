import { protectedProcedure } from "../../procedures";
import { createPurchaseInput, getPurchaseInput } from "./payment.types";
import { paymentHandlers } from "./payment.handlers";

export const paymentRouter = {
  createPurchase: protectedProcedure
    .route({
      method: "POST",
      path: "/payment/purchase",
      tags: ["Payments"],
      summary: "Create purchase intent",
    })
    .input(createPurchaseInput)
    .handler(paymentHandlers.createPurchase),

  getPurchase: protectedProcedure
    .route({
      method: "POST",
      path: "/payment/get",
      tags: ["Payments"],
      summary: "Get purchase status",
    })
    .input(getPurchaseInput)
    .handler(paymentHandlers.getPurchase),
};
