import type { DbType } from "../../lib/db";
import type { DbOrTx } from "../../lib/tx";
import type { AuditRecordParams } from "../audit/audit.service";
import type {
  GroupSize,
  Modality,
  PriceSnapshot,
  EconomyPriceSnapshot,
} from "../pricing/pricing.service";
import type { EconomyParameters } from "../economy";
import type { BookingPayoutPort } from "../booking";
import { createTutorRepo } from "./tutor.repo";
import { createTutorService } from "./tutor.service";
import { createTutorHandler } from "./tutor.handler";
import type { TutorService } from "./tutor.service";
import type { TutorHandler } from "./tutor.handler";

export type TutorModule = ReturnType<typeof createTutorModule>;

export interface TutorPricingPort {
  validatePrices(
    prices: Record<string, number>,
    modality: Modality,
  ): string | null;
  computeSplit(
    modality: Modality,
    tutorPricePerStudent: number,
    confirmedHeadcount: GroupSize,
  ): PriceSnapshot;
  validateBaseRates?(
    baseRatesIdr: Record<string, number>,
    modality: Modality,
    config?: EconomyParameters,
  ): string | null;
  computeEconomics?(
    modality: Modality,
    baseRateIdr: number,
    confirmedHeadcount: GroupSize,
    config: EconomyParameters,
  ): EconomyPriceSnapshot;
  getEconomyConfig?(conn?: DbOrTx): Promise<EconomyParameters>;
}

export interface TutorAuditPort {
  record(params: AuditRecordParams): Promise<void>;
}

export function createTutorModule(deps: {
  db: DbType;
  pricing: TutorPricingPort;
  audit: TutorAuditPort;
  payout: BookingPayoutPort;
}) {
  const repo = createTutorRepo();
  const service = createTutorService({
    tutorRepo: repo,
    pricingPort: deps.pricing,
    auditPort: deps.audit,
    db: deps.db,
    payout: deps.payout,
  });
  const handler = createTutorHandler(service);
  return { service, handler };
}

export type { TutorService, TutorHandler };
