import { ORPCError } from "@orpc/server";
import type { Context } from "../../context";
import { withDomainMap } from "../../lib/handler-utils";
import { mapClassEnrollmentError } from "./class-enrollment.errors";
import type { ClassEnrollmentService } from "./class-enrollment.service";
import {
  adminClassCancellationInput,
  adminClassMinimumCheckInput,
  adminClassMinimumDecisionInput,
  adminClassSessionCancellationInput,
  confirmAdminClassCancellationInput,
  confirmAdminClassMinimumDecisionInput,
  confirmAdminClassSessionCancellationInput,
  classEnrollmentCancellationInput,
  confirmClassEnrollmentCancellationInput,
  changedSessionCancellationInput,
  confirmChangedSessionCancellationInput,
  classEnrollmentIdInput,
  classEnrollmentTopUpPurchaseInput,
  classEnrollmentTopUpQuoteInput,
  createClassEnrollmentInput,
  getMyClassEnrollmentsInput,
  listClassSessionReportsInput,
  submitClassSessionReportInput,
} from "./class-enrollment.types";
import type { z } from "zod";

function getReportActor(context: Context) {
  const user = context.session?.user;
  if (typeof user?.id !== "string" || user.id.length === 0)
    throw new ORPCError("UNAUTHORIZED");
  if (user.role !== "admin" && user.role !== "tutor" && user.role !== "student")
    throw new ORPCError("UNAUTHORIZED");
  return { id: user.id, role: user.role };
}

export function createClassEnrollmentHandler(service: ClassEnrollmentService) {
  return {
    submitSessionReport: async ({
      context,
      input,
    }: {
      context: Context;
      input: z.infer<typeof submitClassSessionReportInput>;
    }) =>
      withDomainMap(() => {
        const actor = getReportActor(context);
        return service.submitSessionReport(actor.id, actor.role, input);
      }, mapClassEnrollmentError),
    listSessionReports: async ({
      context,
      input,
    }: {
      context: Context;
      input: z.infer<typeof listClassSessionReportsInput>;
    }) =>
      withDomainMap(() => {
        const actor = getReportActor(context);
        return service.listSessionReports(actor.id, actor.role, input);
      }, mapClassEnrollmentError),
    previewAdminCancellation: async ({
      context,
      input,
    }: {
      context: Context;
      input: z.infer<typeof adminClassCancellationInput>;
    }) =>
      withDomainMap(
        () => service.previewAdminCancellation(context.session!.user.id, input),
        mapClassEnrollmentError,
      ),
    confirmAdminCancellation: async ({
      context,
      input,
    }: {
      context: Context;
      input: z.infer<typeof confirmAdminClassCancellationInput>;
    }) =>
      withDomainMap(
        () => service.confirmAdminCancellation(context.session!.user.id, input),
        mapClassEnrollmentError,
      ),
    previewAdminSessionCancellation: async ({
      context,
      input,
    }: {
      context: Context;
      input: z.infer<typeof adminClassSessionCancellationInput>;
    }) =>
      withDomainMap(
        () =>
          service.previewAdminSessionCancellation(
            context.session!.user.id,
            input,
          ),
        mapClassEnrollmentError,
      ),
    confirmAdminSessionCancellation: async ({
      context,
      input,
    }: {
      context: Context;
      input: z.infer<typeof confirmAdminClassSessionCancellationInput>;
    }) =>
      withDomainMap(
        () =>
          service.confirmAdminSessionCancellation(
            context.session!.user.id,
            input,
          ),
        mapClassEnrollmentError,
      ),
    getAdminMinimumCheck: async ({
      input,
    }: {
      input: z.infer<typeof adminClassMinimumCheckInput>;
    }) =>
      withDomainMap(
        () => service.getAdminMinimumCheck(input.classId),
        mapClassEnrollmentError,
      ),
    previewAdminMinimumDecision: async ({
      input,
    }: {
      input: z.infer<typeof adminClassMinimumDecisionInput>;
    }) =>
      withDomainMap(
        () => service.previewAdminMinimumDecision(input),
        mapClassEnrollmentError,
      ),
    confirmAdminMinimumDecision: async ({
      context,
      input,
    }: {
      context: Context;
      input: z.infer<typeof confirmAdminClassMinimumDecisionInput>;
    }) =>
      withDomainMap(
        () =>
          service.confirmAdminMinimumDecision(context.session!.user.id, input),
        mapClassEnrollmentError,
      ),
    quoteCancellation: async ({
      context,
      input,
    }: {
      context: Context;
      input: z.infer<typeof classEnrollmentCancellationInput>;
    }) =>
      withDomainMap(
        () => service.quoteCancellation(context.session!.user.id, input),
        mapClassEnrollmentError,
      ),
    confirmCancellation: async ({
      context,
      input,
    }: {
      context: Context;
      input: z.infer<typeof confirmClassEnrollmentCancellationInput>;
    }) =>
      withDomainMap(
        () => service.confirmCancellation(context.session!.user.id, input),
        mapClassEnrollmentError,
      ),
    quoteChangedSessionCancellation: async ({
      context,
      input,
    }: {
      context: Context;
      input: z.infer<typeof changedSessionCancellationInput>;
    }) =>
      withDomainMap(
        () =>
          service.quoteChangedSessionCancellation(
            context.session!.user.id,
            input,
          ),
        mapClassEnrollmentError,
      ),
    confirmChangedSessionCancellation: async ({
      context,
      input,
    }: {
      context: Context;
      input: z.infer<typeof confirmChangedSessionCancellationInput>;
    }) =>
      withDomainMap(
        () =>
          service.confirmChangedSessionCancellation(
            context.session!.user.id,
            input,
          ),
        mapClassEnrollmentError,
      ),
    getMyClassEnrollments: async ({
      context,
      input,
    }: {
      context: Context;
      input: z.infer<typeof getMyClassEnrollmentsInput>;
    }) =>
      withDomainMap(
        () =>
          service.getMyClassEnrollments(
            context.session!.user.id,
            input.classId,
          ),
        mapClassEnrollmentError,
      ),
    createEnrollment: async ({
      context,
      input,
    }: {
      context: Context;
      input: z.infer<typeof createClassEnrollmentInput>;
    }) =>
      withDomainMap(
        () => service.createEnrollment(context.session!.user.id, input),
        mapClassEnrollmentError,
      ),
    completeCheckout: async ({
      context,
      input,
    }: {
      context: Context;
      input: z.infer<typeof classEnrollmentIdInput>;
    }) =>
      withDomainMap(
        () =>
          service.completeCheckout(
            context.session!.user.id,
            input.enrollmentId,
          ),
        mapClassEnrollmentError,
      ),
    paySecondInstallment: async ({
      context,
      input,
    }: {
      context: Context;
      input: z.infer<typeof classEnrollmentIdInput>;
    }) =>
      withDomainMap(
        () =>
          service.paySecondInstallment(
            context.session!.user.id,
            input.enrollmentId,
          ),
        mapClassEnrollmentError,
      ),
    createTopUpQuote: async ({
      context,
      input,
    }: {
      context: Context;
      input: z.infer<typeof classEnrollmentTopUpQuoteInput>;
    }) =>
      withDomainMap(
        () => service.createTopUpQuote(context.session!.user.id, input),
        mapClassEnrollmentError,
      ),
    purchaseTopUp: async ({
      context,
      input,
    }: {
      context: Context;
      input: z.infer<typeof classEnrollmentTopUpPurchaseInput>;
    }) =>
      withDomainMap(
        () => service.purchaseTopUp(context.session!.user.id, input),
        mapClassEnrollmentError,
      ),
  };
}

export type ClassEnrollmentHandler = ReturnType<
  typeof createClassEnrollmentHandler
>;
