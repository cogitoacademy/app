import { z } from "zod";

export const enrollmentPlanSchema = z.enum([
  "full",
  "half",
  "single",
  "masterclass",
]);

export const getMyClassEnrollmentsInput = z.object({
  classId: z.string().uuid(),
});

export const createClassEnrollmentInput = z
  .object({
    classId: z.string().uuid(),
    requestKey: z.string().uuid(),
    plan: enrollmentPlanSchema,
    sessionId: z.string().uuid().optional(),
  })
  .strict();

export const classEnrollmentIdInput = z.object({
  enrollmentId: z.string().uuid(),
});

export const classEnrollmentInstallmentInput = z.object({
  enrollmentId: z.string().uuid(),
  ordinal: z.union([z.literal(1), z.literal(2)]),
});

export const classEnrollmentTopUpQuoteInput =
  classEnrollmentInstallmentInput.extend({
    requestKey: z.string().uuid(),
  });

export const classEnrollmentTopUpPurchaseInput = z.object({
  attemptId: z.string().uuid(),
  choice: z.enum(["package", "custom", "recommended"]),
});

export const enrollmentInstallmentOutput = z.object({
  id: z.string().uuid(),
  ordinal: z.union([z.literal(1), z.literal(2)]),
  rateMarks: z.number().int().positive(),
  sessionCount: z.number().int().positive(),
  amountMarks: z.number().int().positive(),
  state: z.enum([
    "checkout_pending",
    "pending",
    "funded",
    "defaulted",
    "expired",
    "cancelled",
  ]),
  dueAt: z.date().nullable(),
  checkoutExpiresAt: z.date().nullable(),
  fundedAt: z.date().nullable(),
});

export const enrollmentAllocationOutput = z.object({
  sessionId: z.string().uuid(),
  ordinal: z.number().int().positive(),
  sequenceNumber: z.number().int().positive(),
  rateMarks: z.number().int().positive(),
  state: z.enum([
    "checkout_reserved",
    "unfunded_reserved",
    "funded",
    "released",
  ]),
  fundedMarks: z.number().int().nonnegative(),
  spentMarks: z.number().int().nonnegative(),
  releasedMarks: z.number().int().nonnegative(),
});

export const studentClassEnrollmentOutput = z.object({
  id: z.string().uuid(),
  plan: enrollmentPlanSchema,
  state: z.enum(["checkout_pending", "active", "expired", "cancelled"]),
  sessionCount: z.number().int().positive(),
  firstRateMarks: z.number().int().positive(),
  secondRateMarks: z.number().int().positive().nullable(),
  firstInstallmentMarks: z.number().int().positive(),
  secondInstallmentMarks: z.number().int().nonnegative(),
  totalMarks: z.number().int().positive(),
  checkoutExpiresAt: z.date().nullable(),
  createdAt: z.date(),
  installments: z.array(enrollmentInstallmentOutput),
  allocations: z.array(enrollmentAllocationOutput),
});

export const getMyClassEnrollmentsOutput = z.object({
  classId: z.string().uuid(),
  eligibleSessions: z.array(
    z.object({
      sessionId: z.string().uuid(),
      sequenceNumber: z.number().int().positive(),
      startAt: z.date(),
      capacity: z.number().int().positive(),
      seatsAvailable: z.number().int().nonnegative(),
      alreadyEntitled: z.boolean(),
    }),
  ),
  enrollments: z.array(studentClassEnrollmentOutput),
});

export const createClassEnrollmentOutput = studentClassEnrollmentOutput.extend({
  outcome: z.enum(["confirmed", "checkout_pending", "already_exists"]),
  availableMarks: z.number().int().nonnegative(),
  shortfallMarks: z.number().int().nonnegative(),
});

export const classEnrollmentPaymentOutput = z.object({
  enrollment: studentClassEnrollmentOutput,
  outcome: z.enum([
    "funded",
    "checkout_pending",
    "defaulted",
    "expired",
    "insufficient",
  ]),
  availableMarks: z.number().int().nonnegative(),
  shortfallMarks: z.number().int().nonnegative(),
});

export const classEnrollmentTopUpQuoteOutput = z.object({
  attemptId: z.string().uuid(),
  requestKey: z.string().uuid(),
  quoteId: z.string().uuid(),
  requestedMarks: z.number().int().positive(),
  revision: z.number().int().positive(),
  customAmountIdr: z.number().int().positive(),
  exactPackage: z
    .object({
      code: z.string(),
      label: z.string(),
      marks: z.number().int().positive(),
      priceIdr: z.number().int().positive(),
    })
    .nullable(),
  recommendedPackage: z
    .object({
      code: z.string(),
      label: z.string(),
      marks: z.number().int().positive(),
      priceIdr: z.number().int().positive(),
    })
    .nullable(),
  expiresAt: z.string().datetime(),
  choice: z.enum(["package", "custom", "recommended"]).nullable(),
});

export const classEnrollmentTopUpPurchaseOutput = z.object({
  attemptId: z.string().uuid(),
  paymentId: z.string().uuid(),
  checkoutUrl: z.string().url().nullable(),
  status: z.string(),
  recoveryRequired: z.boolean(),
});
