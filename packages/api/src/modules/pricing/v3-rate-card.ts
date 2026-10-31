import {
  DEFAULT_V3_ECONOMY_CONFIG,
  v3EconomyConfigSchema,
  type V3EconomyConfig,
} from "./v3-economy.config";

export type { V3Competition } from "./v3-economy.config";
export const V3_COMPETITION_RATES = DEFAULT_V3_ECONOMY_CONFIG.competitionRates;
export const V3_MARKS_PACKAGES = DEFAULT_V3_ECONOMY_CONFIG.packages;

function requirePositiveInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive safe integer`);
  }
}

/** Uses the booking competition's canonical slug, never a tutor's cheapest subject. */
export function calculateV3SessionPrice(
  input: {
    competition: string;
    modality: "online" | "offline";
    headcount: number;
  },
  values: V3EconomyConfig = DEFAULT_V3_ECONOMY_CONFIG,
) {
  const config = v3EconomyConfigSchema.parse(values);
  const { competition, modality, headcount } = input;
  requirePositiveInteger(headcount, "Headcount");
  if (headcount > 6) throw new RangeError("Headcount cannot exceed 6");
  if (modality !== "online" && modality !== "offline") {
    throw new RangeError("Choose online or offline pricing");
  }
  if (!Object.hasOwn(config.competitionRates, competition)) {
    throw new RangeError("Unsupported competition");
  }
  const rate = config.competitionRates[competition]!;
  const offline = modality === "offline";
  const totalMarks =
    rate.soloMarks +
    (offline ? config.offlineBaseAdditionalMarks : 0) +
    (offline ? config.offlineAdditionalMarks : config.onlineAdditionalMarks) *
      (headcount - 1);
  const perStudentMarks = Math.ceil(totalMarks / headcount);
  return {
    competition,
    modality,
    headcount,
    totalMarks,
    perStudentMarks,
    collectedMarks: perStudentMarks * headcount,
    tutorFeeIdr:
      rate.soloFeeIdr +
      (offline ? config.offlineBaseAdditionalFeeIdr : 0) +
      (offline
        ? config.offlineAdditionalFeeIdr
        : config.onlineAdditionalFeeIdr) *
        (headcount - 1),
  };
}

/** Recommendation is advisory: preserve the requested Marks and exact price. */
export function calculateV3TopUpPrice(
  marks: number,
  values: V3EconomyConfig = DEFAULT_V3_ECONOMY_CONFIG,
) {
  requirePositiveInteger(marks, "Marks");
  const config = v3EconomyConfigSchema.parse(values);
  const exactPackage = config.packages.find((item) => item.marks === marks);
  const tier =
    config.packages.findLast((item) => item.marks <= marks) ??
    config.packages[0]!;
  // Rational unit prices round upward once, after calculating the full purchase.
  const numerator = BigInt(marks) * BigInt(tier.priceIdr);
  const denominator = BigInt(tier.marks);
  const amountIdr =
    exactPackage?.priceIdr ??
    Number(
      (numerator + denominator - 1n) / denominator +
        BigInt(marks) * BigInt(config.exactSurchargeIdr),
    );
  requirePositiveInteger(amountIdr, "Top-up amount");
  const nextPackage = config.packages.find((item) => item.marks > marks);
  return {
    marks,
    amountIdr,
    packageCode: exactPackage?.code ?? null,
    recommendation:
      !exactPackage && nextPackage && amountIdr >= nextPackage.priceIdr
        ? { ...nextPackage }
        : null,
  };
}
