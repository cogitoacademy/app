import { z } from "zod";

export const dashboardAnalyticsInput = z
  .object({
    period: z.enum(["7d", "30d", "90d"]).default("30d"),
  })
  .optional();

export const listUsersInput = z
  .object({
    limit: z.number().min(1).max(100).default(50),
    offset: z.number().min(0).default(0),
  })
  .optional();

export const adminSearchUsersInput = z.object({
  query: z.string().trim().min(2).max(100),
  limit: z.number().int().min(1).max(20).default(10),
});

export const setRoleInput = z.object({
  userId: z.string().max(100),
  role: z.enum(["student", "tutor", "admin"]),
  expectedRole: z.enum(["student", "tutor", "admin"]),
});

export const adminGetWalletInput = z.object({
  userId: z.string().max(100),
});

export const adminGetTutorPayoutsInput = z.object({
  tutorId: z.string().max(100),
  dateFrom: z.string().max(100).optional(),
  dateTo: z.string().max(100).optional(),
});

export const adminMarkTutorPayoutPaidInput = z.object({
  tutorId: z.string().max(100),
});

export const adminListLedgerEntriesInput = z.object({
  walletId: z.string().max(100).optional(),
  userId: z.string().max(100).optional(),
  limit: z.number().min(1).max(100).optional(),
  cursor: z.string().max(100).optional(),
  bookingId: z.string().max(100).optional(),
  entryType: z
    .enum([
      "credit",
      "hold",
      "release",
      "deduct",
      "compensate_credit",
      "compensate_deduct",
    ])
    .optional(),
  dateFrom: z.string().max(100).optional(),
  dateTo: z.string().max(100).optional(),
});

export const adminUpdateEconomySettingsInput = z.object({
  expectedVersion: z.number().int().min(1),
  onlineCogitoBaseIdr: z
    .number()
    .int()
    .min(5_000)
    .max(10_000_000)
    .multipleOf(5_000),
  onlineCogitoIncrementIdr: z
    .number()
    .int()
    .min(0)
    .max(10_000_000)
    .multipleOf(5_000),
  offlineCogitoBaseIdr: z
    .number()
    .int()
    .min(5_000)
    .max(10_000_000)
    .multipleOf(5_000),
  offlineCogitoIncrementIdr: z
    .number()
    .int()
    .min(0)
    .max(10_000_000)
    .multipleOf(5_000),
});
