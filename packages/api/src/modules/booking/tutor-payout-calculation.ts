export const DEFAULT_TUTOR_TAX_RATES_BPS = {
  nikNpwp: 250,
  nikOnly: 300,
  missing: 300,
} as const;

export type TutorTaxStatus = "nik_npwp" | "nik_only" | "missing";
export type TutorTaxRateSource =
  | "default_nik_npwp"
  | "default_nik_only"
  | "default_missing"
  | "tutor_override";

export class TutorPayoutCalculationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TutorPayoutCalculationError";
  }
}

export function tutorTaxStatus(profile: {
  legalName: string | null | undefined;
  nik: string | null | undefined;
  npwp: string | null | undefined;
}): TutorTaxStatus {
  if (!profile.legalName?.trim() || !/^\d{16}$/.test(profile.nik ?? "")) {
    return "missing";
  }
  return profile.npwp?.trim() ? "nik_npwp" : "nik_only";
}

function assertIdr(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TutorPayoutCalculationError(
      `${label} must be a non-negative safe integer`,
    );
  }
}

export function calculateTutorTaxIdr(grossIdr: number, taxRateBps: number) {
  assertIdr(grossIdr, "Gross amount");
  if (
    !Number.isSafeInteger(taxRateBps) ||
    taxRateBps < 0 ||
    taxRateBps > 10_000
  ) {
    throw new TutorPayoutCalculationError(
      "Tax rate must be from 0.00% to 100.00%",
    );
  }

  const roundedTax = (BigInt(grossIdr) * BigInt(taxRateBps) + 5_000n) / 10_000n;
  return Number(roundedTax);
}

export function calculateTutorPayoutAmounts(input: {
  grossIdr: number;
  taxRateBps: number;
  bankName: string;
}): { taxIdr: number; transferFeeIdr: number; netIdr: number } {
  assertIdr(input.grossIdr, "Gross amount");
  const taxIdr = calculateTutorTaxIdr(input.grossIdr, input.taxRateBps);
  const transferFeeIdr =
    input.bankName.trim().toUpperCase() === "BCA" ? 0 : 2_500;
  const netIdr = input.grossIdr - taxIdr - transferFeeIdr;
  if (!Number.isSafeInteger(netIdr) || netIdr < 0) {
    throw new TutorPayoutCalculationError(
      "Gross amount is below the tax and transfer fees",
    );
  }
  return { taxIdr, transferFeeIdr, netIdr };
}

export function sumSafeIdr(values: number[]): number {
  let total = 0;
  for (const value of values) {
    assertIdr(value, "Session fee");
    total += value;
    if (!Number.isSafeInteger(total)) {
      throw new TutorPayoutCalculationError(
        "Gross amount exceeds the safe IDR range",
      );
    }
  }
  return total;
}
