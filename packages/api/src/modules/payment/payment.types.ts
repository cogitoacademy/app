import { z } from "zod";

export const createPurchaseInput = z.object({
  packageCode: z.string().min(1),
});

export const createPurchaseOutput = z.object({
  paymentId: z.string(),
  providerReference: z.string(),
  checkoutUrl: z.string(),
});

export const getPurchaseInput = z.object({
  paymentId: z.string(),
});

export const getPurchaseOutput = z.object({
  id: z.string(),
  status: z.string(),
  provider: z.string(),
  providerReference: z.string(),
  amountIdr: z.number(),
  marks: z.number(),
  receiptUrl: z.string().nullable(),
  failureReason: z.string().nullable(),
  createdAt: z.string(),
});
