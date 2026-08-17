import { z } from "zod";

export const updateMyProfileInput = z.object({
  version: z.number().int(),
  displayName: z.string().min(1).max(255).optional(),
  shortBio: z.string().max(2000).optional(),
  credentialsSummary: z.string().max(2000).optional(),
  expertise: z.array(z.string().max(255)).max(20).optional(),
  modality: z.enum(["online", "offline", "both"]).optional(),
  prices: z
    .record(z.string(), z.number())
    .refine(
      (record) => {
        const keys = Object.keys(record);
        return keys.length <= 6 && keys.every((k) => /^[1-6]$/.test(k));
      },
      { message: "prices must be keyed by group size 1-6" },
    )
    .optional(),
  availabilitySummary: z.string().max(2000).optional(),
  proofUrls: z.array(z.string().url().max(2048)).max(10).optional(),
});

export const getMyPayoutsInput = z.object({
  dateFrom: z.string().max(100).optional(),
  dateTo: z.string().max(100).optional(),
});
