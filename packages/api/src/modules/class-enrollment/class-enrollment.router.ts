import {
  adminProcedure,
  studentProcedure,
  verifiedStudentProcedure,
  protectedProcedure,
} from "../../procedures";
import type { ClassEnrollmentHandler } from "./class-enrollment.handler";
import {
  adminClassCancellationInput,
  confirmAdminClassCancellationInput,
  adminClassCancellationOutput,
  adminClassMinimumCheckInput,
  adminClassMinimumCheckOutput,
  adminClassMinimumDecisionInput,
  adminClassMinimumDecisionOutput,
  adminClassSessionCancellationInput,
  adminClassSessionCancellationOutput,
  confirmAdminClassMinimumDecisionInput,
  confirmAdminClassSessionCancellationInput,
  classEnrollmentCancellationInput,
  confirmClassEnrollmentCancellationInput,
  changedSessionCancellationInput,
  confirmChangedSessionCancellationInput,
  changedSessionCancellationOutput,
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
  submitClassSessionReportInput,
  classSessionReportOutput,
  listClassSessionReportsInput,
  listClassSessionReportsOutput,
} from "./class-enrollment.types";

export function createClassEnrollmentRouter(handler: ClassEnrollmentHandler) {
  return {
    submitSessionReport: protectedProcedure
      .route({
        method: "POST",
        path: "/classes/sessions/report/submit",
        tags: ["Classes", "Reports"],
        summary: "Submit or correct a delivered class session report",
      })
      .input(submitClassSessionReportInput)
      .output(classSessionReportOutput)
      .handler(handler.submitSessionReport),
    listSessionReports: protectedProcedure
      .route({
        method: "POST",
        path: "/classes/sessions/reports/list",
        tags: ["Classes", "Reports"],
        summary: "List private class sessions and eligible reports",
      })
      .input(listClassSessionReportsInput)
      .output(listClassSessionReportsOutput)
      .handler(handler.listSessionReports),
    previewAdminCancellation: adminProcedure
      .route({
        method: "POST",
        path: "/admin/classes/cancellation/quote",
        tags: ["Admin", "Classes"],
        summary: "Review exact future-hold returns before cancelling a class",
      })
      .input(adminClassCancellationInput)
      .output(adminClassCancellationOutput)
      .handler(handler.previewAdminCancellation),
    confirmAdminCancellation: adminProcedure
      .route({
        method: "POST",
        path: "/admin/classes/cancellation/confirm",
        tags: ["Admin", "Classes"],
        summary:
          "Cancel future class sessions and return unspent future holds once",
      })
      .input(confirmAdminClassCancellationInput)
      .output(adminClassCancellationOutput)
      .handler(handler.confirmAdminCancellation),
    previewAdminSessionCancellation: adminProcedure
      .route({
        method: "POST",
        path: "/admin/classes/session-cancellation/quote",
        tags: ["Admin", "Classes"],
        summary:
          "Review exact returns before cancelling one future class session",
      })
      .input(adminClassSessionCancellationInput)
      .output(adminClassSessionCancellationOutput)
      .handler(handler.previewAdminSessionCancellation),
    confirmAdminSessionCancellation: adminProcedure
      .route({
        method: "POST",
        path: "/admin/classes/session-cancellation/confirm",
        tags: ["Admin", "Classes"],
        summary:
          "Cancel one future class session and release only its seat holds",
      })
      .input(confirmAdminClassSessionCancellationInput)
      .output(adminClassSessionCancellationOutput)
      .handler(handler.confirmAdminSessionCancellation),
    getAdminMinimumCheck: adminProcedure
      .route({
        method: "POST",
        path: "/admin/classes/minimum-check",
        tags: ["Admin", "Classes"],
        summary: "Count unique active paid full/half-plan cohort students",
      })
      .input(adminClassMinimumCheckInput)
      .output(adminClassMinimumCheckOutput)
      .handler(handler.getAdminMinimumCheck),
    previewAdminMinimumDecision: adminProcedure
      .route({
        method: "POST",
        path: "/admin/classes/minimum-decision/quote",
        tags: ["Admin", "Classes"],
        summary: "Review a cohort continue or once-only postponement decision",
      })
      .input(adminClassMinimumDecisionInput)
      .output(adminClassMinimumDecisionOutput)
      .handler(handler.previewAdminMinimumDecision),
    confirmAdminMinimumDecision: adminProcedure
      .route({
        method: "POST",
        path: "/admin/classes/minimum-decision/confirm",
        tags: ["Admin", "Classes"],
        summary: "Record a cohort minimum decision and replacement schedule",
      })
      .input(confirmAdminClassMinimumDecisionInput)
      .output(adminClassMinimumDecisionOutput)
      .handler(handler.confirmAdminMinimumDecision),
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
    quoteChangedSessionCancellation: studentProcedure
      .route({
        method: "POST",
        path: "/classes/enrollments/changed-session-cancellation/quote",
        tags: ["Classes", "Enrollment"],
        summary: "Quote a penalty-free exit from a rescheduled session",
      })
      .input(changedSessionCancellationInput)
      .output(changedSessionCancellationOutput)
      .handler(handler.quoteChangedSessionCancellation),
    confirmChangedSessionCancellation: studentProcedure
      .route({
        method: "POST",
        path: "/classes/enrollments/changed-session-cancellation/confirm",
        tags: ["Classes", "Enrollment"],
        summary: "Cancel one changed session and return its funded Marks",
      })
      .input(confirmChangedSessionCancellationInput)
      .output(changedSessionCancellationOutput)
      .handler(handler.confirmChangedSessionCancellation),
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
