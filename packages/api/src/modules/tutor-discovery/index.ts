import type { DbType } from "../../lib/db";
import { createDiscoveryRepo } from "./discovery.repo";
import { createDiscoveryHandler } from "./discovery.handler";
import type { DiscoveryHandler } from "./discovery.handler";

export type DiscoveryModule = ReturnType<typeof createDiscoveryModule>;

export function createDiscoveryModule(deps: { db: DbType }) {
  const repo = createDiscoveryRepo();
  const handler = createDiscoveryHandler({ discoveryRepo: repo, db: deps.db });
  return { handler };
}

export type { DiscoveryHandler };
