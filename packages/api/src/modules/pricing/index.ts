import { createPricingService } from "./pricing.service";
import type { PricingPort } from "./pricing.service";
import type { DbType } from "../../lib/db";
import type { EconomyService } from "../economy";

export type PricingModule = ReturnType<typeof createPricingModule>;

export function createPricingModule(
  deps: {
    db?: DbType;
    economy?: EconomyService;
  } = {},
) {
  const service = createPricingService(deps);
  return { service };
}

export type { PricingPort };
