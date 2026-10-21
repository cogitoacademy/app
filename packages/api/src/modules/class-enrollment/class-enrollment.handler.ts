import type { Context } from "../../context";
import { withDomainMap } from "../../lib/handler-utils";
import { mapClassEnrollmentError } from "./class-enrollment.errors";
import type { ClassEnrollmentService } from "./class-enrollment.service";
import {
  classEnrollmentCancellationInput,
  confirmClassEnrollmentCancellationInput,
  classEnrollmentIdInput,
  classEnrollmentTopUpPurchaseInput,
  classEnrollmentTopUpQuoteInput,
  createClassEnrollmentInput,
  getMyClassEnrollmentsInput,
} from "./class-enrollment.types";
import type { z } from "zod";

export function createClassEnrollmentHandler(service: ClassEnrollmentService) {
  return {
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
