import type { DbType } from "../../lib/db";
import type { AuditRecordParams } from "../audit/audit.service";
import type { GroupSize, PriceSnapshot } from "../pricing/pricing.service";
import { createTutorRepo } from "./tutor.repo";
import { createTutorService } from "./tutor.service";
import { createTutorHandler } from "./tutor.handler";
import type { TutorService } from "./tutor.service";
import type { TutorHandler } from "./tutor.handler";

export type TutorModule = ReturnType<typeof createTutorModule>;

interface TutorPricingPort {
  validatePrices(
    prices: Record<string, number>,
    modality: "online" | "offline" | "both",
  ): string | null;
  computeSplit(totalMarks: number, groupSize: GroupSize): PriceSnapshot;
}

interface TutorAuditPort {
  record(params: AuditRecordParams): Promise<void>;
}

export function createTutorModule(deps: {
  db: DbType;
  pricing: TutorPricingPort;
  audit: TutorAuditPort;
}) {
  const repo = createTutorRepo();
  const service = createTutorService({
    tutorRepo: repo,
    pricingPort: deps.pricing,
    auditPort: deps.audit,
    db: deps.db,
  });
  const handler = createTutorHandler(service);
  return { service, handler };
}

export type { TutorService, TutorHandler };
