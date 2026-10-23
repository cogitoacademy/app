import { z } from "zod";

const referralCodeInput = z
  .string()
  .trim()
  .min(4)
  .max(32)
  .regex(/^[A-Za-z0-9]+$/)
  .transform((code) => code.toUpperCase());

export const saveGoogleChoiceInput = z.object({
  code: referralCodeInput.nullable(),
});

export const updateReferralSettingsInput = z.object({
  expectedVersion: z.number().int().nonnegative(),
  welcomeMarks: z.number().int().min(0).max(100_000),
  friendRewardMarks: z.number().int().min(0).max(100_000),
  semesterCapMarks: z.number().int().min(0).max(1_000_000),
  reason: z.string().trim().min(3).max(600),
});

export const createKolCampaignInput = z
  .object({
    name: z.string().trim().min(1).max(100),
    code: referralCodeInput,
    expiresAt: z.coerce.date(),
    activationAt: z.coerce.date().optional(),
    attributionWindowDays: z.number().int().min(1).max(365).default(90),
    flatAmountIdr: z.number().int().min(0).max(100_000_000).default(0),
    percentBps: z.number().int().min(0).max(10_000).default(0),
  })
  .refine(
    (input) => !input.activationAt || input.expiresAt > input.activationAt,
    {
      message: "Campaign expiry must be after activation.",
      path: ["expiresAt"],
    },
  )
  .refine((input) => input.flatAmountIdr > 0 || input.percentBps > 0, {
    message: "Set a flat commission, a percentage, or both.",
    path: ["flatAmountIdr"],
  });

export const listKolCommissionsInput = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).max(512).optional(),
});

export type SaveGoogleChoiceInput = typeof saveGoogleChoiceInput._output;
export type UpdateReferralSettingsInput =
  typeof updateReferralSettingsInput._output;
export type CreateKolCampaignInput = typeof createKolCampaignInput._output;
export type ListKolCommissionsInput = typeof listKolCommissionsInput._output;
