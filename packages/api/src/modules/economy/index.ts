import type { DbType } from "../../lib/db";
import { createEconomyRepo } from "./economy.repo";
import { createEconomyService } from "./economy.service";

export function createEconomyModule(deps: { db: DbType }) {
  const repo = createEconomyRepo();
  const service = createEconomyService({ db: deps.db, repo });
  return { service };
}

export type { EconomyService } from "./economy.service";
export type {
  EconomyConfig,
  EconomyConfigUpdate,
  EconomyParameters,
} from "./economy.types";
export { DEFAULT_ECONOMY_CONFIG, ECONOMY_CONFIG_ID } from "./economy.types";
