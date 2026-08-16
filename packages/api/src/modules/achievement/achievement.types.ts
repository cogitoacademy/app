import { z } from "zod";

export const achievementInput = z.object({
  eventName: z.string().min(1, "Event name is required").max(255),
  category: z.string().min(1, "Category is required").max(255),
  award: z.string().min(1, "Award is required").max(255),
  level: z.string().min(1, "Level is required").max(255),
  awardingDate: z
    .string()
    .max(255)
    .refine((v) => !Number.isNaN(Date.parse(v)), {
      message: "awardingDate must be a valid date",
    })
    .optional(),
  location: z.string().max(255).optional(),
  description: z.string().max(2000).optional(),
  subjects: z.array(z.string().max(255)).max(20).optional(),
  evidenceUrl: z.string().url().max(2048).optional(),
  documentationUrl: z.string().url().max(2048).optional(),
});

export const updateAchievementInput = z.object({
  id: z.string().max(100),
  version: z.number().int(),
  data: achievementInput.partial(),
});

export const deleteAchievementInput = z.object({
  id: z.string().max(100),
  version: z.number().int(),
});

export const adminListInput = z
  .object({
    status: z.string().max(255).optional(),
    limit: z.number().min(1).max(100).default(50),
    offset: z.number().min(0).default(0),
  })
  .optional();

export const adminReviewInput = z.object({
  achievementId: z.string().max(100),
  status: z.enum(["approved", "rejected"]),
  adminNote: z.string().max(2000).optional(),
});
