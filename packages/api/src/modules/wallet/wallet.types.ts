import { z } from "zod";

export const listLedgerInput = z.object({
  cursor: z.string().max(100).optional(),
  limit: z.number().min(1).max(100).optional(),
  bookingId: z.string().max(100).optional(),
  eventKey: z.string().max(255).optional(),
});

export const walletOutput = z.object({
  totalBalance: z.number(),
  heldBalance: z.number(),
  availableBalance: z.number(),
});

export const knowledgeBankOutput = z.object({
  eligible: z.boolean(),
  balance: z.number(),
  threshold: z.number(),
});

export const packagesOutput = z.object({
  // Client-visible payment mode signal: "test" when the deployment uses
  // Xendit Test Mode, "live" for Live Mode, null when the stub provider is
  // active. Drives the Test Mode amount-cap labels on package cards.
  xenditMode: z.enum(["test", "live"]).nullable(),
  packages: z.array(
    z.object({
      id: z.string(),
      code: z.string(),
      name: z.string(),
      marks: z.number(),
      priceIdr: z.number(),
      isActive: z.boolean(),
      createdAt: z.date(),
      updatedAt: z.date(),
    }),
  ),
});
