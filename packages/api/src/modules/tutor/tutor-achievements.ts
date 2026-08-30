import { z } from "zod";

export const tutorEducationEntryInput = z.object({
  university: z.string().trim().min(1).max(255),
  degree: z.string().trim().min(1).max(255),
});

export const tutorEducationInput = z.array(tutorEducationEntryInput).max(2);

export const tutorCompetitionAchievementInput = z.object({
  competitionName: z.string().trim().min(1).max(255),
  year: z.number().int().min(1900).max(2100),
  awards: z.array(z.string().trim().min(1).max(255)).min(1).max(10),
});

export const tutorCompetitionAchievementsInput = z
  .array(tutorCompetitionAchievementInput)
  .max(5);

export type TutorEducationEntry = z.infer<typeof tutorEducationEntryInput>;
export type TutorCompetitionAchievement = z.infer<
  typeof tutorCompetitionAchievementInput
>;
