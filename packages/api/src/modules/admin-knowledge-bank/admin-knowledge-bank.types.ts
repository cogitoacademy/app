import { z } from "zod";

const grantId = z.string().trim().min(1).max(100);
const grantExpiry = z.string().datetime({ offset: true });
const grantNote = z.string().trim().max(500).optional();

export const listKnowledgeBankAccessInput = z.object({
  search: z.string().trim().max(100).optional(),
  status: z.enum(["all", "active", "expired"]).default("all"),
});

export const createKnowledgeBankAccessInput = z.object({
  email: z.string().trim().email().max(320),
  expiresAt: grantExpiry,
  note: grantNote,
});

export const updateKnowledgeBankAccessInput = z.object({
  id: grantId,
  expiresAt: grantExpiry,
  note: grantNote,
});

export const removeKnowledgeBankAccessInput = z.object({
  id: grantId,
});

export type KnowledgeBankAccessStatus = "all" | "active" | "expired";
export type ListKnowledgeBankAccessInput = z.infer<
  typeof listKnowledgeBankAccessInput
>;
export type CreateKnowledgeBankAccessInput = z.infer<
  typeof createKnowledgeBankAccessInput
>;
export type UpdateKnowledgeBankAccessInput = z.infer<
  typeof updateKnowledgeBankAccessInput
>;
