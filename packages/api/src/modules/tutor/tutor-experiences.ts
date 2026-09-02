import { z } from "zod";

export const tutorExperienceEntryInput = z
  .object({
    role: z.string().trim().min(1).max(255),
    organization: z.string().trim().min(1).max(255),
    startYear: z.number().int().min(1900).max(2100),
    endYear: z.number().int().min(1900).max(2100).nullable(),
    description: z.string().trim().min(1).max(1000),
  })
  .superRefine((entry, ctx) => {
    if (entry.endYear !== null && entry.endYear < entry.startYear) {
      ctx.addIssue({
        code: "custom",
        message: "endYear must be on or after startYear",
        path: ["endYear"],
      });
    }
  });

export const tutorExperienceEntriesInput = z
  .array(tutorExperienceEntryInput)
  .max(5);

export type TutorExperienceEntry = z.infer<typeof tutorExperienceEntryInput>;
