import { protectedProcedure, verifiedStudentProcedure } from "../../procedures";
import {
  createPurchaseInput,
  getPurchaseInput,
  simulatePurchaseInput,
} from "./payment.types";
import type { PaymentHandler } from "./payment.handler";

export function createPaymentRouter(handler: PaymentHandler) {
  return {
    getConfig: protectedProcedure
      .route({
        method: "POST",
        path: "/payment/config",
        tags: ["Payments"],
        summary: "Get public payment configuration",
      })
      .handler(handler.getConfig),

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

    simulatePurchase: verifiedStudentProcedure
      .route({
        method: "POST",
        path: "/payment/purchase/simulate",
        tags: ["Payments"],
        summary: "Simulate a Test Mode purchase",
        description:
          "Completes an owned pending Test Mode purchase through the active provider's simulation API; Midtrans Sandbox uses test cards instead",
      })
      .input(simulatePurchaseInput)
      .handler(handler.simulatePurchase),

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
