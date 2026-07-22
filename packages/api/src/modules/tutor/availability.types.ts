import { z } from "zod";

export const upsertAvailabilityInput = z
  .object({
    id: z.string().optional(),
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    modality: z.enum(["online", "offline", "both"]),
    isRecurring: z.boolean().optional(),
    recurrenceRule: z.string().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((d) => d.endDate > d.startDate, {
    message: "endDate must be after startDate",
    path: ["endDate"],
  });

export const deleteAvailabilityInput = z.object({
  id: z.string(),
});
