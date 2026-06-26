import { z } from "zod";

export const listPublishedInput = z
  .object({
    search: z.string().optional(),
    expertise: z.string().optional(),
    modality: z.enum(["online", "offline", "both"]).optional(),
    limit: z.number().min(1).max(50).default(20),
    offset: z.number().min(0).default(0),
  })
  .optional();

export const getProfileInput = z.object({
  tutorId: z.string(),
});
