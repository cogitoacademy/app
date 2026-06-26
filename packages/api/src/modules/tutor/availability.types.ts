import { z } from "zod";

export const upsertAvailabilityInput = z.object({
  id: z.string().optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  modality: z.enum(["online", "offline", "both"]),
  isRecurring: z.boolean().optional(),
  recurrenceRule: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const deleteAvailabilityInput = z.object({
  id: z.string(),
});
