import { z } from "zod";
import { externalHttpUrl } from "../../lib/url-schema";

export const ACHIEVEMENT_CATEGORIES = [
  "competition",
  "award",
  "certificate",
  "leadership",
  "publication",
  "other",
] as const;

export const achievementInput = z.object({
  eventName: z.string().min(1, "Event name is required").max(255),
  category: z.enum(ACHIEVEMENT_CATEGORIES),
  award: z.string().min(1, "Award is required").max(255),
  level: z.string().min(1, "Level is required").max(255),
  issuer: z.string().max(255).optional(),
  visibility: z.boolean().optional(),
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
  evidenceUrl: externalHttpUrl.optional(),
  documentationUrl: externalHttpUrl.optional(),
});

/** Student submissions do not choose the public-facing documentation image. */
export const studentAchievementInput = achievementInput.omit({
  documentationUrl: true,
});

const achievementUpdateData = z.object({
  eventName: z.string().min(1, "Event name is required").max(255).optional(),
  category: z.enum(ACHIEVEMENT_CATEGORIES).optional(),
  award: z.string().min(1, "Award is required").max(255).optional(),
  level: z.string().min(1, "Level is required").max(255).optional(),
  issuer: z.string().max(255).nullable().optional(),
  visibility: z.boolean().optional(),
  awardingDate: z
    .string()
    .max(255)
    .refine((v) => !Number.isNaN(Date.parse(v)), {
      message: "awardingDate must be a valid date",
    })
    .nullable()
    .optional(),
  location: z.string().max(255).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  subjects: z.array(z.string().max(255)).max(20).nullable().optional(),
  evidenceUrl: externalHttpUrl.nullable().optional(),
  documentationUrl: externalHttpUrl.nullable().optional(),
});

const versionedAchievementUpdateInput = z.object({
  id: z.string().max(100),
  version: z.number().int(),
  data: achievementUpdateData,
});

const studentAchievementUpdateData = achievementUpdateData.omit({
  documentationUrl: true,
});

export const updateAchievementInput = z.object({
  id: z.string().max(100),
  version: z.number().int(),
  data: studentAchievementUpdateData,
});
export const adminUpdateAchievementInput = versionedAchievementUpdateInput;

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
  status: z.enum(["approved", "rejected", "archived"]),
  adminNote: z.string().max(2000).optional(),
});
