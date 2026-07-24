import { createPricingService } from "./pricing.service";
import type { PricingPort } from "./pricing.service";

export type PricingModule = ReturnType<typeof createPricingModule>;

export function createPricingModule() {
  const service = createPricingService();
  return { service };
}

export type { PricingPort };
