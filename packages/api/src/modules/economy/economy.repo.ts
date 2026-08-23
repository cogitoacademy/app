import { and, eq, sql } from "drizzle-orm";
import { economyConfig } from "@cogito-app/db/schema";
import type { DbOrTx } from "../../lib/tx";
import {
  DEFAULT_ECONOMY_CONFIG,
  ECONOMY_CONFIG_ID,
  type EconomyConfigUpdate,
} from "./economy.types";

export async function getOrCreate(conn: DbOrTx) {
  const [existing] = await conn
    .select()
    .from(economyConfig)
    .where(eq(economyConfig.id, ECONOMY_CONFIG_ID))
    .limit(1);
  if (existing) return existing;

  await conn
    .insert(economyConfig)
    .values(DEFAULT_ECONOMY_CONFIG)
    .onConflictDoNothing({ target: economyConfig.id });

  const [created] = await conn
    .select()
    .from(economyConfig)
    .where(eq(economyConfig.id, ECONOMY_CONFIG_ID))
    .limit(1);
  if (!created) throw new Error("Economy configuration could not be created");
  return created;
}

export async function updateWithVersion(
  conn: DbOrTx,
  expectedVersion: number,
  updatedBy: string,
  input: EconomyConfigUpdate,
) {
  return conn
    .update(economyConfig)
    .set({
      ...input,
      updatedBy,
      version: sql`${economyConfig.version} + 1`,
    })
    .where(
      and(
        eq(economyConfig.id, ECONOMY_CONFIG_ID),
        eq(economyConfig.version, expectedVersion),
      ),
    )
    .returning();
}

export function createEconomyRepo() {
  return { getOrCreate, updateWithVersion };
}

export type EconomyRepo = ReturnType<typeof createEconomyRepo>;
