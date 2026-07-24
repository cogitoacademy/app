import { z } from "zod";

export const createPurchaseInput = z.object({
  packageCode: z.string().min(1).max(100),
});

export const createPurchaseOutput = z.object({
  paymentId: z.string().max(100),
  providerReference: z.string().max(255),
  checkoutUrl: z.string().max(2048),
});

export const getPurchaseInput = z.object({
  paymentId: z.string().max(100),
});

export const getPurchaseOutput = z.object({
  id: z.string().max(100),
  status: z.string().max(50),
  provider: z.string().max(50),
  providerReference: z.string().max(255),
  amountIdr: z.number(),
  marks: z.number(),
  receiptUrl: z.string().max(2048).nullable(),
  failureReason: z.string().max(2000).nullable(),
  createdAt: z.string().max(100),
});
