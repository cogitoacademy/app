export type GroupSize = 1 | 2 | 3 | 4 | 5 | 6;
export type Modality = "online" | "offline" | "both";

export interface PriceSnapshot {
  perStudent: number;
  baseline: number;
  tutorShare: number;
  cogitoTake: number;
}

export interface PricingPort {
  validatePrices(
    prices: Record<string, number>,
    modality: Modality,
  ): string | null;
  computeSplit(totalMarks: number, groupSize: GroupSize): PriceSnapshot;
}
