import { z } from "zod";

export const upsertAvailabilityInput = z
  .object({
    id: z.string().max(100).optional(),
    startDate: z.coerce
      .date()
      .refine((d) => d > new Date(), "Must be in the future"),
    endDate: z.coerce
      .date()
      .refine((d) => d > new Date(), "Must be in the future"),
    modality: z.enum(["online", "offline", "both"]),
    isRecurring: z.boolean().optional(),
    recurrenceRule: z.string().max(255).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((d) => d.endDate > d.startDate, {
    message: "endDate must be after startDate",
    path: ["endDate"],
  });

export const deleteAvailabilityInput = z.object({
  id: z.string().max(100),
});
