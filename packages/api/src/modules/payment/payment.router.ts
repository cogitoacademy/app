import { protectedProcedure, verifiedStudentProcedure } from "../../procedures";
import {
  createPurchaseInput,
  createPurchaseOutput,
  createTopUpQuoteInput,
  createTopUpQuoteOutput,
  createPurchaseFromQuoteInput,
  createPurchaseFromQuoteOutput,
  getTopUpCatalogOutput,
  getPurchaseInput,
  getPurchaseOutput,
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
      .output(createPurchaseOutput)
      .handler(handler.createPurchase),

    getTopUpCatalog: protectedProcedure
      .route({
        method: "POST",
        path: "/payment/top-up/catalog",
        tags: ["Payments"],
        summary: "Get active V3 top-up packages",
      })
      .output(getTopUpCatalogOutput)
      .handler(handler.getTopUpCatalog),

    createTopUpQuote: verifiedStudentProcedure
      .route({
        method: "POST",
        path: "/payment/top-up/quote",
        tags: ["Payments"],
        summary: "Create a V3 top-up quote",
        description: "Creates an owned, immutable 15-minute top-up quote.",
      })
      .input(createTopUpQuoteInput)
      .output(createTopUpQuoteOutput)
      .handler(handler.createTopUpQuote),

    createPurchaseFromQuote: verifiedStudentProcedure
      .route({
        method: "POST",
        path: "/payment/top-up/purchase",
        tags: ["Payments"],
        summary: "Create a purchase from a V3 quote",
      })
      .input(createPurchaseFromQuoteInput)
      .output(createPurchaseFromQuoteOutput)
      .handler(handler.createPurchaseFromQuote),

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
      .output(getPurchaseOutput)
      .handler(handler.getPurchase),
  };
}
