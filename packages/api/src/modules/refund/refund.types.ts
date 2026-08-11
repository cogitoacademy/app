import { z } from "zod";

export const createCorrectionInput = z.object({
  walletId: z.string().max(100),
  amount: z.number().positive().max(100000),
  type: z.enum(["compensate_credit", "compensate_deduct"]),
  reason: z.string().min(1).max(2000),
  bookingId: z.string().max(100).optional(),
});

export const listCorrectionsInput = z.object({
  walletId: z.string().max(100),
  limit: z.number().min(1).max(100).optional(),
  cursor: z.string().max(100).optional(),
});
