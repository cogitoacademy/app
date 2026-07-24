import { z } from "zod";

export const updateMyProfileInput = z.object({
  version: z.number().int(),
  displayName: z.string().min(1).optional(),
  shortBio: z.string().optional(),
  credentialsSummary: z.string().optional(),
  expertise: z.array(z.string()).optional(),
  modality: z.enum(["online", "offline", "both"]).optional(),
  prices: z.record(z.string(), z.number()).optional(),
  availabilitySummary: z.string().optional(),
  proofUrls: z.array(z.string().url()).optional(),
});
