import type {
  PricingPort,
  PriceSnapshot,
  GroupSize,
  Modality,
} from "../../shared/ports/pricing.port";

const ONLINE_FLOOR_PRICES: Record<number, number> = {
  1: 42,
  2: 35,
  3: 28,
  4: 24,
  5: 21,
  6: 19,
};

const OFFLINE_FLOOR_PRICES: Record<number, number> = {
  1: 50,
  2: 45,
  3: 40,
  4: 35,
  5: 30,
  6: 27,
};

const COGITO_TAKE_RATE = 0.2;
const TUTOR_PAYOUT_RATE_IDR = 7000;

export type PricingService = ReturnType<typeof createPricingService>;

export function createPricingService(): PricingPort {
  function getFloorPrices(modality: Modality): Record<number, number> {
    if (modality === "online") return ONLINE_FLOOR_PRICES;
    if (modality === "offline") return OFFLINE_FLOOR_PRICES;
    const higher: Record<number, number> = {};
    for (const size of [1, 2, 3, 4, 5, 6]) {
      higher[size] = Math.max(
        ONLINE_FLOOR_PRICES[size]!,
        OFFLINE_FLOOR_PRICES[size]!,
      );
    }
    return higher;
  }

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

  function computeSplit(
    totalMarks: number,
    groupSize: GroupSize,
  ): PriceSnapshot {
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

  return { validatePrices, computeSplit };
}

export { ONLINE_FLOOR_PRICES, OFFLINE_FLOOR_PRICES, TUTOR_PAYOUT_RATE_IDR };
