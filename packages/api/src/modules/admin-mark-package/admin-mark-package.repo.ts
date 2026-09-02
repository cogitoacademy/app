import { asc, eq } from "drizzle-orm";
import { markPackage } from "@cogito-app/db/schema";
import type { DbOrTx } from "../../lib/tx";

export type MarkPackageRow = typeof markPackage.$inferSelect;

export interface InsertMarkPackageValues {
  code: string;
  name: string;
  marks: number;
  priceIdr: number;
  isActive: boolean;
}

export interface UpdateMarkPackageValues {
  name: string;
  marks: number;
  priceIdr: number;
}

export async function listAll(conn: DbOrTx): Promise<MarkPackageRow[]> {
  return conn
    .select()
    .from(markPackage)
    .orderBy(asc(markPackage.marks), asc(markPackage.code));
}

export async function getById(
  conn: DbOrTx,
  id: string,
): Promise<MarkPackageRow | null> {
  const [row] = await conn
    .select()
    .from(markPackage)
    .where(eq(markPackage.id, id))
    .limit(1);
  return row ?? null;
}

export async function insert(
  conn: DbOrTx,
  values: InsertMarkPackageValues,
): Promise<MarkPackageRow> {
  const [row] = await conn.insert(markPackage).values(values).returning();
  return row!;
}

export async function updateDetails(
  conn: DbOrTx,
  id: string,
  values: UpdateMarkPackageValues,
): Promise<MarkPackageRow | null> {
  const [row] = await conn
    .update(markPackage)
    .set(values)
    .where(eq(markPackage.id, id))
    .returning();
  return row ?? null;
}

export async function setActive(
  conn: DbOrTx,
  id: string,
  isActive: boolean,
): Promise<MarkPackageRow | null> {
  const [row] = await conn
    .update(markPackage)
    .set({ isActive })
    .where(eq(markPackage.id, id))
    .returning();
  return row ?? null;
}

export function createAdminMarkPackageRepo() {
  return { listAll, getById, insert, updateDetails, setActive };
}

export type AdminMarkPackageRepo = ReturnType<
  typeof createAdminMarkPackageRepo
>;
