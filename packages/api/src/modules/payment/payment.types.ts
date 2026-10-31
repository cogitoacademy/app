import { z } from "zod";

export const createPurchaseInput = z.object({
  packageCode: z.string().min(1).max(100),
});

export const createPurchaseOutput = z.object({
  paymentId: z.string().max(100),
  providerReference: z.string().max(255),
  checkoutUrl: z.string().max(2048).nullable(),
  status: z.string().max(50).default("PENDING"),
  recoveryRequired: z.boolean().default(false),
  canSimulate: z.boolean().optional(),
});

export const topUpPackageOutput = z.object({
  code: z.string().max(100),
  label: z.string().max(160),
  marks: z.number().int().positive(),
  priceIdr: z.number().int().positive(),
});

export const getTopUpCatalogOutput = z.discriminatedUnion("active", [
  z.object({
    active: z.literal(false),
    revision: z.null(),
    packages: z.array(topUpPackageOutput),
    exactSurchargeIdr: z.number().int().nonnegative(),
    quoteTtlSeconds: z.literal(900),
  }),
  z.object({
    active: z.literal(true),
    revision: z.number().int().positive(),
    packages: z.array(topUpPackageOutput),
    exactSurchargeIdr: z.number().int().nonnegative(),
    quoteTtlSeconds: z.literal(900),
  }),
]);

export const createTopUpQuoteInput = z.object({
  requestKey: z.string().uuid(),
  marks: z.number().int().min(1).max(1_000_000),
});

export const createTopUpQuoteOutput = z.object({
  quoteId: z.string().uuid(),
  revision: z.number().int().positive(),
  marks: z.number().int().positive(),
  customAmountIdr: z.number().int().positive(),
  exactPackage: topUpPackageOutput.nullable(),
  recommendedPackage: topUpPackageOutput.nullable(),
  expiresAt: z.string().datetime(),
});

export const createPurchaseFromQuoteInput = z.object({
  quoteId: z.string().uuid(),
  choice: z.enum(["package", "custom", "recommended"]),
});

export const createPurchaseFromQuoteOutput = createPurchaseOutput.extend({
  purchaseLabel: z.string().max(200),
  quoteId: z.string().uuid(),
  choice: z.enum(["package", "custom", "recommended"]),
});

export const simulatePurchaseInput = z.object({
  paymentId: z.string().uuid(),
});

export const simulatePurchaseOutput = z.object({
  status: z.literal("PENDING"),
  message: z.string().max(500),
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
  checkoutUrl: z.string().max(2048).nullable(),
  failureReason: z.string().max(2000).nullable(),
  purchaseLabel: z.string().max(200).nullable(),
  quoteId: z.string().uuid().nullable(),
  quoteChoice: z.enum(["package", "custom", "recommended"]).nullable(),
  providerIntentState: z.enum(["CREATING", "READY", "UNCERTAIN"]).nullable(),
  createdAt: z.string().max(100),
});
