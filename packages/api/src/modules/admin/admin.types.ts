import { z } from "zod";

export const listUsersInput = z
  .object({
    limit: z.number().min(1).max(100).default(50),
    offset: z.number().min(0).default(0),
  })
  .optional();

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
