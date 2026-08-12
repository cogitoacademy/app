import {
  ONLINE_FLOOR_PRICES,
  OFFLINE_FLOOR_PRICES,
  COGITO_TAKE_RATE,
  MODALITY,
} from "../../shared/constants";

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

export type PricingService = ReturnType<typeof createPricingService>;

function getFloorPrices(modality: Modality): Record<number, number> {
  if (modality === MODALITY.ONLINE) return ONLINE_FLOOR_PRICES;
  if (modality === MODALITY.OFFLINE) return OFFLINE_FLOOR_PRICES;
  const higher: Record<number, number> = {};
  for (const size of [1, 2, 3, 4, 5, 6]) {
    higher[size] = Math.max(
      ONLINE_FLOOR_PRICES[size]!,
      OFFLINE_FLOOR_PRICES[size]!,
    );
  }
  return higher;
}

/**
 * Validates tutor-set prices against the Cogito floor for each group size.
 *
 * @param prices - map of group size (as string) to price in Marks
 * @param modality - online/offline/both (both takes the max floor)
 * @returns an error message string, or null when all prices are valid
 * @throws {never} - returns a string instead of throwing
 */
function validatePrices(
  prices: Record<string, number>,
  modality: Modality,
): string | null {
  if (!prices || Object.keys(prices).length === 0) {
    return "Prices are required";
  }

  const floorPrices = getFloorPrices(modality);

  for (const [size, price] of Object.entries(prices)) {
    const groupSize = Number(size);
    if (groupSize < 1 || groupSize > 6) {
      return `Invalid group size: ${size}`;
    }
    if (typeof price !== "number" || price < 0) {
      return `Invalid price for group size ${size}`;
    }

    const floor = floorPrices[groupSize];
    if (floor !== undefined && price < floor) {
      return `Price for class size ${size} must be at least ${floor} Marks (floor price)`;
    }
  }

  return null;
}

/**
 * Computes the price split for a group session.
 *
 * @param totalMarks - total Marks paid for the session
 * @param groupSize - number of students in the group (1-6)
 * @returns the PriceSnapshot with per-student price, baseline, tutor share, and Cogito take
 */
function computeSplit(totalMarks: number, groupSize: GroupSize): PriceSnapshot {
  const perStudent = Math.floor(totalMarks / groupSize);
  const cogitoTake = Math.floor(totalMarks * COGITO_TAKE_RATE);
  const tutorShare = totalMarks - cogitoTake;
  return {
    perStudent,
    baseline: totalMarks,
    tutorShare,
    cogitoTake,
  };
}

/**
 * Creates the pricing service with price validation and split computation.
 *
 * @returns a PricingPort with validatePrices and computeSplit
 */
export function createPricingService(): PricingPort {
  return { validatePrices, computeSplit };
}
