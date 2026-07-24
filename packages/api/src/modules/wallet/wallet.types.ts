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
