import { z } from "zod";

export const achievementInput = z.object({
  eventName: z.string().min(1, "Event name is required"),
  category: z.string().min(1, "Category is required"),
  award: z.string().min(1, "Award is required"),
  level: z.string().min(1, "Level is required"),
  eventDate: z.string().optional(),
  location: z.string().optional(),
  description: z.string().optional(),
  subjects: z.array(z.string()).optional(),
  imageUrl: z.string().optional(),
});

export const updateAchievementInput = z.object({
  id: z.string(),
  version: z.number().int(),
  data: achievementInput.partial(),
});

export const deleteAchievementInput = z.object({
  id: z.string(),
  version: z.number().int(),
});

export const adminListInput = z
  .object({
    status: z.string().optional(),
    limit: z.number().min(1).max(100).default(50),
    offset: z.number().min(0).default(0),
  })
  .optional();

export const adminReviewInput = z.object({
  achievementId: z.string(),
  status: z.enum(["approved", "rejected"]),
  adminNote: z.string().optional(),
});
