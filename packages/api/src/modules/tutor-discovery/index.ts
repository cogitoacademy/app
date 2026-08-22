import type { DbType } from "../../lib/db";
import type { PricingPort } from "../pricing";
import { createDiscoveryRepo } from "./discovery.repo";
import { createDiscoveryService } from "./discovery.service";
import { createDiscoveryHandler } from "./discovery.handler";
import type { DiscoveryHandler } from "./discovery.handler";

export type DiscoveryModule = ReturnType<typeof createDiscoveryModule>;

export function createDiscoveryModule(deps: {
  db: DbType;
  pricing?: PricingPort;
}) {
  const repo = createDiscoveryRepo(deps.db);
  const service = createDiscoveryService({ repo, pricing: deps.pricing });
  const handler = createDiscoveryHandler({ service });
  return { service, handler };
}

export type { DiscoveryHandler };
