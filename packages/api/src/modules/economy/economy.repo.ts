import { and, desc, eq, sql, getTableColumns } from "drizzle-orm";
import {
  economyConfig,
  economyV3Activation,
  economyV3Revision,
} from "@cogito-app/db/schema";
import type { DbOrTx } from "../../lib/tx";
import {
  DEFAULT_ECONOMY_CONFIG,
  ECONOMY_CONFIG_ID,
  type EconomyConfigUpdate,
} from "./economy.types";

export async function getOrCreate(conn: DbOrTx) {
  const [existing] = await conn
    .select({ ...getTableColumns(economyConfig) })
    .from(economyConfig)
    .where(eq(economyConfig.id, ECONOMY_CONFIG_ID))
    .limit(1);
  if (existing) return existing;

  await conn
    .insert(economyConfig)
    .values(DEFAULT_ECONOMY_CONFIG)
    .onConflictDoNothing({ target: economyConfig.id });

  const [created] = await conn
    .select({ ...getTableColumns(economyConfig) })
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
  return {
    getOrCreate,
    updateWithVersion,
    getLatestV3Revision,
    getV3RevisionByVersion,
    getActiveV3Revision,
    appendV3Revision,
    activateV3Revision,
  };
}

export async function getV3RevisionByVersion(conn: DbOrTx, version: number) {
  const [row] = await conn
    .select()
    .from(economyV3Revision)
    .where(eq(economyV3Revision.version, version))
    .limit(1);
  return row ?? null;
}

export async function getActiveV3Revision(conn: DbOrTx) {
  const [activation] = await conn
    .select({ version: economyV3Activation.activeRevision })
    .from(economyV3Activation)
    .where(eq(economyV3Activation.id, "default"))
    .limit(1);
  if (activation?.version == null) return null;
  return getV3RevisionByVersion(conn, activation.version);
}

export async function getLatestV3Revision(conn: DbOrTx) {
  const [row] = await conn
    .select()
    .from(economyV3Revision)
    .orderBy(desc(economyV3Revision.version))
    .limit(1);
  return row ?? null;
}

export async function appendV3Revision(
  conn: DbOrTx,
  input: {
    expectedVersion: number;
    values: unknown;
    reason: string;
    createdBy: string;
  },
) {
  await conn.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended('economy-v3-revision', 0))`,
  );
  const latest = await getLatestV3Revision(conn);
  if ((latest?.version ?? 0) !== input.expectedVersion) return null;
  const [created] = await conn
    .insert(economyV3Revision)
    .values({
      version: input.expectedVersion + 1,
      values: input.values,
      reason: input.reason,
      createdBy: input.createdBy,
    })
    .returning();
  if (!created) throw new Error("V3 economy revision could not be saved");
  return created;
}

export type EconomyRepo = ReturnType<typeof createEconomyRepo>;

export async function activateV3Revision(
  conn: DbOrTx,
  input: {
    version: number;
    expectedActiveRevision: number | null;
    updatedBy: string;
  },
) {
  await conn.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended('economy-v3-revision', 0))`,
  );
  const latest = await getLatestV3Revision(conn);
  const active = await getActiveV3Revision(conn);
  if (
    latest?.version !== input.version ||
    (active?.version ?? null) !== input.expectedActiveRevision
  )
    return null;
  await conn
    .insert(economyV3Activation)
    .values({
      id: "default",
      activeRevision: input.version,
      updatedBy: input.updatedBy,
    })
    .onConflictDoUpdate({
      target: economyV3Activation.id,
      set: {
        activeRevision: input.version,
        updatedBy: input.updatedBy,
        updatedAt: new Date(),
      },
    });
  return latest;
}
