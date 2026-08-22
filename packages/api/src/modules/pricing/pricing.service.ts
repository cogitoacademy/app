import {
  ONLINE_FLOOR_PRICES,
  OFFLINE_FLOOR_PRICES,
  ONLINE_BASELINE_SPLIT,
  OFFLINE_BASELINE_SPLIT,
  EXTRA_TAKE_DIVISOR,
  MODALITY,
} from "../../shared/constants";
import type { DbType } from "../../lib/db";
import type { DbOrTx } from "../../lib/tx";
import type { EconomyParameters, EconomyService } from "../economy";
import { DEFAULT_ECONOMY_CONFIG } from "../economy";

export type GroupSize = 1 | 2 | 3 | 4 | 5 | 6;
export type Modality = "online" | "offline" | "both";

export interface PriceSnapshot {
  perStudent: number;
  baseline: number;
  tutorShare: number;
  cogitoTake: number;
  baselineCogitoTake: number;
  baselineTutorShare: number;
  extraTotal: number;
  cogitoExtraTake: number;
  tutorExtraShare: number;
}

export interface EconomyPriceSnapshot extends PriceSnapshot {
  economyVersion: number;
  markValueIdr: number;
  tutorBaseRateIdr: number;
  tutorIncrementIdr: number;
  tutorHonorariumIdr: number;
  cogitoBaseTakeIdr: number;
  cogitoIncrementIdr: number;
  cogitoTakeIdr: number;
  totalIdr: number;
  totalMarks: number;
  actualMarksPooled: number;
}

export interface PricingPort {
  validatePrices(
    prices: Record<string, number>,
    modality: Modality,
  ): string | null;
  computeSplit(
    modality: Modality,
    tutorPricePerStudent: number,
    confirmedHeadcount: GroupSize,
  ): PriceSnapshot;
  validateBaseRates(
    baseRatesIdr: Record<string, number>,
    modality: Modality,
    config?: EconomyParameters,
  ): string | null;
  computeEconomics(
    modality: Modality,
    baseRateIdr: number,
    confirmedHeadcount: GroupSize,
    config: EconomyParameters,
  ): EconomyPriceSnapshot;
  getEconomyConfig(conn?: DbOrTx): Promise<EconomyParameters>;
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
 * Returns the baseline split (tutor share + Cogito take) for a modality
 * and group size, per the PRD floor pricing tables.
 *
 * @param modality - the session modality (online/offline; both uses online)
 * @param size - the group size (1-6)
 * @returns the baseline tutor share and Cogito take in Marks
 */
function getBaselineSplit(
  modality: Modality,
  size: GroupSize,
): { tutor: number; cogito: number } {
  const table =
    modality === MODALITY.OFFLINE
      ? OFFLINE_BASELINE_SPLIT
      : ONLINE_BASELINE_SPLIT;
  return table[size]!;
}

/**
 * Computes the price split for a group session using the PRD extra-take rule.
 *
 * Baseline split comes from the modality/group-size tables. Any amount above
 * the baseline total is split by the extra-take rule: Cogito takes 1 Mark per
 * full 5 Marks of extra total, the remainder goes to the tutor.
 *
 * @param modality - the session modality (online/offline)
 * @param tutorPricePerStudent - the tutor-set per-student price in Marks
 * @param confirmedHeadcount - the confirmed number of students (1-6)
 * @returns the PriceSnapshot with baseline, tutor share, and Cogito take breakdown
 */
function computeSplit(
  modality: Modality,
  tutorPricePerStudent: number,
  confirmedHeadcount: GroupSize,
): PriceSnapshot {
  const perStudent = Math.floor(tutorPricePerStudent);
  const tutorTotal = perStudent * confirmedHeadcount;
  const baseline = getBaselineSplit(modality, confirmedHeadcount);
  const baselineTotal = baseline.tutor + baseline.cogito;
  const extraTotal = tutorTotal - baselineTotal;
  const cogitoExtraTake =
    extraTotal > 0 ? Math.floor(extraTotal / EXTRA_TAKE_DIVISOR) : 0;
  const tutorExtraShare = extraTotal - cogitoExtraTake;

  const baselineCogitoTake = baseline.cogito;
  const baselineTutorShare = baseline.tutor;
  const cogitoTake = baselineCogitoTake + cogitoExtraTake;
  const tutorShare = baselineTutorShare + tutorExtraShare;

  return {
    perStudent,
    baseline: baselineTotal,
    tutorShare,
    cogitoTake,
    baselineCogitoTake,
    baselineTutorShare,
    extraTotal,
    cogitoExtraTake,
    tutorExtraShare,
  };
}

function validateBaseRates(
  baseRatesIdr: Record<string, number>,
  modality: Modality,
  config: EconomyParameters = DEFAULT_ECONOMY_CONFIG,
): string | null {
  if (!baseRatesIdr || Object.keys(baseRatesIdr).length === 0) {
    return "At least one IDR base honorarium is required";
  }

  const requiredModalities =
    modality === MODALITY.BOTH
      ? [MODALITY.ONLINE, MODALITY.OFFLINE]
      : [modality];
  for (const required of requiredModalities) {
    const value = baseRatesIdr[required];
    if (typeof value !== "number" || !Number.isInteger(value)) {
      return `A ${required} base honorarium is required`;
    }
    if (value < config.minTutorBaseRateIdr) {
      return `${required} base honorarium must be at least Rp ${config.minTutorBaseRateIdr.toLocaleString("id-ID")}`;
    }
    if (value % 5_000 !== 0) {
      return `${required} base honorarium must use Rp 5,000 increments`;
    }
  }

  for (const key of Object.keys(baseRatesIdr)) {
    if (key !== MODALITY.ONLINE && key !== MODALITY.OFFLINE) {
      return `Invalid modality base honorarium: ${key}`;
    }
  }

  return null;
}

function computeEconomics(
  modality: Modality,
  baseRateIdr: number,
  confirmedHeadcount: GroupSize,
  config: EconomyParameters,
): EconomyPriceSnapshot {
  const effectiveModality =
    modality === MODALITY.OFFLINE ? MODALITY.OFFLINE : MODALITY.ONLINE;
  const tutorIncrementIdr =
    effectiveModality === MODALITY.OFFLINE
      ? config.offlineTutorIncrementIdr
      : config.onlineTutorIncrementIdr;
  const cogitoBaseTakeIdr =
    effectiveModality === MODALITY.OFFLINE
      ? config.offlineCogitoBaseIdr
      : config.onlineCogitoBaseIdr;
  const cogitoIncrementIdr =
    effectiveModality === MODALITY.OFFLINE
      ? config.offlineCogitoIncrementIdr
      : config.onlineCogitoIncrementIdr;
  const tutorHonorariumIdr =
    baseRateIdr + (confirmedHeadcount - 1) * tutorIncrementIdr;
  const cogitoTakeIdr =
    cogitoBaseTakeIdr + (confirmedHeadcount - 1) * cogitoIncrementIdr;
  const totalIdr = tutorHonorariumIdr + cogitoTakeIdr;
  const totalMarks = Math.ceil(totalIdr / config.markValueIdr);
  const perStudent = Math.ceil(totalMarks / confirmedHeadcount);
  const actualMarksPooled = perStudent * confirmedHeadcount;
  const cogitoTake = Math.round(cogitoTakeIdr / config.markValueIdr);
  const tutorShare = Math.max(totalMarks - cogitoTake, 0);

  return {
    perStudent,
    baseline: totalMarks,
    tutorShare,
    cogitoTake,
    baselineCogitoTake: cogitoTake,
    baselineTutorShare: tutorShare,
    extraTotal: 0,
    cogitoExtraTake: 0,
    tutorExtraShare: 0,
    economyVersion: config.version,
    markValueIdr: config.markValueIdr,
    tutorBaseRateIdr: baseRateIdr,
    tutorIncrementIdr,
    tutorHonorariumIdr,
    cogitoBaseTakeIdr,
    cogitoIncrementIdr,
    cogitoTakeIdr,
    totalIdr,
    totalMarks,
    actualMarksPooled,
  };
}

/**
 * Creates the pricing service with price validation and split computation.
 *
 * @returns a PricingPort with validatePrices and computeSplit
 */
export function createPricingService(
  deps: {
    db?: DbType;
    economy?: EconomyService;
  } = {},
): PricingPort {
  async function getEconomyConfig(conn?: DbOrTx): Promise<EconomyParameters> {
    if (!deps.economy) return DEFAULT_ECONOMY_CONFIG;
    if (!conn && !deps.db) {
      throw new Error("A database connection is required for economy config");
    }
    return deps.economy.getConfig(conn ?? deps.db!);
  }

  return {
    validatePrices,
    computeSplit,
    validateBaseRates,
    computeEconomics,
    getEconomyConfig,
  };
}
