import type { economyConfig } from "@cogito-app/db/schema";

export const ECONOMY_CONFIG_ID = "default";

export type EconomyConfig = typeof economyConfig.$inferSelect;

export type EconomyParameters = Pick<
  EconomyConfig,
  | "version"
  | "markValueIdr"
  | "minTutorBaseRateIdr"
  | "onlineTutorIncrementIdr"
  | "offlineTutorIncrementIdr"
  | "onlineCogitoBaseIdr"
  | "onlineCogitoIncrementIdr"
  | "offlineCogitoBaseIdr"
  | "offlineCogitoIncrementIdr"
>;

/** Client-approved defaults from the Phase 0 Marks Economy blueprint. */
export const DEFAULT_ECONOMY_CONFIG = {
  id: ECONOMY_CONFIG_ID,
  markValueIdr: 5_000,
  minTutorBaseRateIdr: 50_000,
  onlineTutorIncrementIdr: 30_000,
  offlineTutorIncrementIdr: 40_000,
  onlineCogitoBaseIdr: 50_000,
  onlineCogitoIncrementIdr: 20_000,
  offlineCogitoBaseIdr: 90_000,
  offlineCogitoIncrementIdr: 40_000,
  version: 1,
} as const;

export type EconomyConfigUpdate = Pick<
  EconomyConfig,
  | "onlineCogitoBaseIdr"
  | "onlineCogitoIncrementIdr"
  | "offlineCogitoBaseIdr"
  | "offlineCogitoIncrementIdr"
>;
