import type { DbType } from "../../lib/db";
import type { DbOrTx } from "../../lib/tx";
import { createEconomyRepo, type EconomyRepo } from "./economy.repo";
import type { EconomyConfigUpdate } from "./economy.types";

export function createEconomyService(deps: { db: DbType; repo?: EconomyRepo }) {
  const repo = deps.repo ?? createEconomyRepo();

  async function getConfig(conn: DbOrTx = deps.db) {
    return repo.getOrCreate(conn);
  }

  async function updateConfig(
    conn: DbOrTx,
    input: {
      expectedVersion: number;
      updatedBy: string;
      values: EconomyConfigUpdate;
    },
  ) {
    await repo.getOrCreate(conn);
    const [updated] = await repo.updateWithVersion(
      conn,
      input.expectedVersion,
      input.updatedBy,
      input.values,
    );
    return updated ?? null;
  }

  return { getConfig, updateConfig };
}

export type EconomyService = ReturnType<typeof createEconomyService>;
