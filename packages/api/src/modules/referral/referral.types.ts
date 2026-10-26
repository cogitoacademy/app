import { z } from "zod";

export const listReferralUsageInput = z.object({
  search: z.string().trim().max(120).default(""),
  kind: z.enum(["all", "friend", "kol", "promotion", "none"]).default("all"),
  page: z.number().int().min(0).max(100_000).default(0),
  limit: z.number().int().min(1).max(100).default(25),
});
export type ListReferralUsageInput = z.infer<typeof listReferralUsageInput>;

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
    purpose: z.enum(["kol", "promotion"]).default("kol"),
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
  .refine(
    (input) =>
      input.purpose === "promotion"
        ? input.flatAmountIdr === 0 && input.percentBps === 0
        : input.flatAmountIdr > 0 || input.percentBps > 0,
    {
      message:
        "KOL campaigns require commission; Academy promotions must have zero commission.",
      path: ["flatAmountIdr"],
    },
  );

export const listKolCommissionsInput = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).max(512).optional(),
});

export type SaveGoogleChoiceInput = typeof saveGoogleChoiceInput._output;
export type UpdateReferralSettingsInput =
  typeof updateReferralSettingsInput._output;
export type CreateKolCampaignInput = Omit<
  typeof createKolCampaignInput._output,
  "purpose"
> & { purpose?: "kol" | "promotion" };
export type ListKolCommissionsInput = typeof listKolCommissionsInput._output;

const settlementBase = {
  decisionId: z.string().uuid(),
  operationId: z.string().uuid(),
};
export const recordKolTransferInput = z.object({
  ...settlementBase,
  amountIdr: z.number().int().min(1).max(1_000_000_000),
  paidAt: z.coerce.date(),
  reference: z.string().trim().min(1).max(600),
});
export const adjustKolCommissionInput = z.object({
  ...settlementBase,
  amountIdr: z
    .number()
    .int()
    .min(-1_000_000_000)
    .max(1_000_000_000)
    .refine((value) => value !== 0),
  expectedObligationIdr: z.number().int().safe(),
  reason: z.string().trim().min(3).max(600),
});
export const getKolSettlementInput = z.object({
  decisionId: z.string().uuid(),
});

export const exportKolMonthlyInput = z.object({
  month: z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/),
});
