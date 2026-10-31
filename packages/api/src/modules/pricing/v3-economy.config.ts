import { z } from "zod";

export const V3_COMPETITIONS = [
  "competition-model-united-nations",
  "competition-world-scholars-cup",
  "competition-debate",
  "competition-olympiad",
  "competition-essay-writing",
  "competition-business",
  "competition-public-speaking",
] as const;

export type V3Competition = (typeof V3_COMPETITIONS)[number];

const competitionSlug = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Competition slug must be lowercase kebab case",
  );

const marks = z.number().int().min(1).max(1_000_000);
const idr = z.number().int().min(1).max(2_000_000_000);
const adjustment = z.number().int().min(0).max(1_000_000);
const feeAdjustment = z.number().int().min(0).max(100_000_000);

export const v3EconomyConfigSchema = z
  .object({
    packages: z
      .array(
        z
          .object({
            code: z
              .string()
              .trim()
              .min(1)
              .max(100)
              .regex(/^[a-z0-9-]+$/),
            marks,
            priceIdr: idr,
          })
          .strict(),
      )
      .min(1)
      .max(20),
    exactSurchargeIdr: feeAdjustment,
    competitionRates: z.record(
      competitionSlug,
      z
        .object({
          soloMarks: marks,
          soloFeeIdr: idr,
        })
        .strict(),
    ),
    onlineAdditionalMarks: adjustment,
    onlineAdditionalFeeIdr: feeAdjustment,
    offlineBaseAdditionalMarks: adjustment,
    offlineAdditionalMarks: adjustment,
    offlineBaseAdditionalFeeIdr: feeAdjustment,
    offlineAdditionalFeeIdr: feeAdjustment,
  })
  .strict()
  .superRefine((value, ctx) => {
    for (const competition of V3_COMPETITIONS) {
      if (!Object.hasOwn(value.competitionRates, competition)) {
        ctx.addIssue({
          code: "custom",
          path: ["competitionRates", competition],
          message: "The seven default competition rates are required",
        });
      }
    }
    for (const [competition, rate] of Object.entries(value.competitionRates)) {
      if (
        rate.soloFeeIdr +
          value.offlineBaseAdditionalFeeIdr +
          value.offlineAdditionalFeeIdr * 5 >
          2_000_000_000 ||
        rate.soloFeeIdr + value.onlineAdditionalFeeIdr * 5 > 2_000_000_000
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["competitionRates", competition, "soloFeeIdr"],
          message:
            "Session fees must not exceed 2,000,000,000 IDR for any group size",
        });
      }
    }
    const codes = new Set<string>();
    for (const [index, item] of value.packages.entries()) {
      if (codes.has(item.code)) {
        ctx.addIssue({
          code: "custom",
          path: ["packages", index, "code"],
          message: "Package codes must be unique",
        });
      }
      codes.add(item.code);
      const previous = value.packages[index - 1];
      if (
        previous &&
        (item.marks <= previous.marks || item.priceIdr <= previous.priceIdr)
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["packages", index],
          message: "Package Marks and prices must be strictly ascending",
        });
      }
      if (
        previous &&
        item.priceIdr * previous.marks >= previous.priceIdr * item.marks
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["packages", index, "priceIdr"],
          message: "Larger packages must have a lower price per Mark",
        });
      }
    }
  });

export type V3EconomyConfig = z.infer<typeof v3EconomyConfigSchema>;

export const DEFAULT_V3_ECONOMY_CONFIG: V3EconomyConfig = {
  packages: [
    { code: "starter", marks: 50, priceIdr: 350_000 },
    { code: "learner", marks: 150, priceIdr: 975_000 },
    { code: "explorer", marks: 250, priceIdr: 1_500_000 },
    { code: "pioneer", marks: 500, priceIdr: 2_750_000 },
  ],
  exactSurchargeIdr: 250,
  competitionRates: {
    "competition-model-united-nations": { soloMarks: 50, soloFeeIdr: 200_000 },
    "competition-world-scholars-cup": { soloMarks: 50, soloFeeIdr: 200_000 },
    "competition-debate": { soloMarks: 44, soloFeeIdr: 180_000 },
    "competition-olympiad": { soloMarks: 44, soloFeeIdr: 180_000 },
    "competition-essay-writing": { soloMarks: 38, soloFeeIdr: 160_000 },
    "competition-business": { soloMarks: 38, soloFeeIdr: 160_000 },
    "competition-public-speaking": { soloMarks: 38, soloFeeIdr: 160_000 },
  },
  onlineAdditionalMarks: 12,
  onlineAdditionalFeeIdr: 30_000,
  offlineBaseAdditionalMarks: 22,
  offlineAdditionalMarks: 20,
  offlineBaseAdditionalFeeIdr: 75_000,
  offlineAdditionalFeeIdr: 50_000,
};
