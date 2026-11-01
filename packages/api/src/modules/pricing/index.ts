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
export {
  calculateV3SessionPrice,
  calculateV3TopUpPrice,
  V3_COMPETITION_RATES,
  V3_MARKS_PACKAGES,
  type V3Competition,
} from "./v3-rate-card";
