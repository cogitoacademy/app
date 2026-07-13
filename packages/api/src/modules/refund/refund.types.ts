import { z } from "zod";

export const createCorrectionInput = z.object({
  walletId: z.string(),
  amount: z.number().positive(),
  type: z.enum(["compensate_credit", "compensate_deduct"]),
  reason: z.string().min(1),
  bookingId: z.string().optional(),
});

export const listCorrectionsInput = z.object({
  walletId: z.string(),
  limit: z.number().min(1).max(100).optional(),
  cursor: z.string().optional(),
});
