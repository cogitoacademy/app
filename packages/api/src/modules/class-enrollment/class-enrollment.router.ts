import { studentProcedure, verifiedStudentProcedure } from "../../procedures";
import type { ClassEnrollmentHandler } from "./class-enrollment.handler";
import {
  classEnrollmentCancellationInput,
  confirmClassEnrollmentCancellationInput,
  classEnrollmentCancellationOutput,
  classEnrollmentIdInput,
  classEnrollmentTopUpPurchaseInput,
  classEnrollmentTopUpQuoteInput,
  createClassEnrollmentInput,
  createClassEnrollmentOutput,
  getMyClassEnrollmentsInput,
  getMyClassEnrollmentsOutput,
  classEnrollmentPaymentOutput,
  classEnrollmentTopUpQuoteOutput,
  classEnrollmentTopUpPurchaseOutput,
} from "./class-enrollment.types";

export function createClassEnrollmentRouter(handler: ClassEnrollmentHandler) {
  return {
    quoteCancellation: studentProcedure
      .route({
        method: "POST",
        path: "/classes/enrollments/cancellation/quote",
        tags: ["Classes", "Enrollment"],
        summary: "Preview the exact cancellation fee and Marks return",
      })
      .input(classEnrollmentCancellationInput)
      .output(classEnrollmentCancellationOutput)
      .handler(handler.quoteCancellation),
    confirmCancellation: studentProcedure
      .route({
        method: "POST",
        path: "/classes/enrollments/cancellation/confirm",
        tags: ["Classes", "Enrollment"],
        summary: "Confirm a current cancellation quote once",
      })
      .input(confirmClassEnrollmentCancellationInput)
      .output(classEnrollmentCancellationOutput)
      .handler(handler.confirmCancellation),
    getMyEnrollments: studentProcedure
      .route({
        method: "POST",
        path: "/classes/enrollments/mine",
        tags: ["Classes", "Enrollment"],
        summary: "Get the signed-in student's class enrollment and seat status",
      })
      .input(getMyClassEnrollmentsInput)
      .output(getMyClassEnrollmentsOutput)
      .handler(handler.getMyClassEnrollments),

    createEnrollment: verifiedStudentProcedure
      .route({
        method: "POST",
        path: "/classes/enrollments/create",
        tags: ["Classes", "Enrollment"],
        summary: "Reserve class sessions using the current published rates",
      })
      .input(createClassEnrollmentInput)
      .output(createClassEnrollmentOutput)
      .handler(handler.createEnrollment),

    completeCheckout: verifiedStudentProcedure
      .route({
        method: "POST",
        path: "/classes/enrollments/checkout",
        tags: ["Classes", "Enrollment"],
        summary: "Hold the first installment from the student's Marks wallet",
      })
      .input(classEnrollmentIdInput)
      .output(classEnrollmentPaymentOutput)
      .handler(handler.completeCheckout),

    paySecondInstallment: verifiedStudentProcedure
      .route({
        method: "POST",
        path: "/classes/enrollments/pay-second-installment",
        tags: ["Classes", "Enrollment"],
        summary:
          "Hold the snapshotted second installment before its due session",
      })
      .input(classEnrollmentIdInput)
      .output(classEnrollmentPaymentOutput)
      .handler(handler.paySecondInstallment),

    createTopUpQuote: verifiedStudentProcedure
      .route({
        method: "POST",
        path: "/classes/enrollments/top-up/quote",
        tags: ["Classes", "Enrollment"],
        summary: "Quote the exact Marks shortfall for an owned installment",
      })
      .input(classEnrollmentTopUpQuoteInput)
      .output(classEnrollmentTopUpQuoteOutput)
      .handler(handler.createTopUpQuote),

    purchaseTopUp: verifiedStudentProcedure
      .route({
        method: "POST",
        path: "/classes/enrollments/top-up/purchase",
        tags: ["Classes", "Enrollment"],
        summary: "Purchase the immutable top-up quote linked to an installment",
      })
      .input(classEnrollmentTopUpPurchaseInput)
      .output(classEnrollmentTopUpPurchaseOutput)
      .handler(handler.purchaseTopUp),
  };
}
