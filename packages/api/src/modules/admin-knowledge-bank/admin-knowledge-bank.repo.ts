import { and, asc, desc, eq, gt, ilike, lte, or, sql } from "drizzle-orm";
import { knowledgeBankAccessGrant, user } from "@cogito-app/db/schema";

import type { DbOrTx } from "../../lib/tx";
import type { ListKnowledgeBankAccessInput } from "./admin-knowledge-bank.types";

export type KnowledgeBankAccessGrantRow =
  typeof knowledgeBankAccessGrant.$inferSelect;

export type KnowledgeBankAccessListRow = {
  id: string;
  userId: string;
  studentName: string;
  studentEmail: string;
  expiresAt: Date;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type StudentIdentityRow = Pick<
  typeof user.$inferSelect,
  "id" | "name" | "email" | "role"
>;

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

const listColumns = {
  id: knowledgeBankAccessGrant.id,
  userId: knowledgeBankAccessGrant.userId,
  studentName: user.name,
  studentEmail: user.email,
  expiresAt: knowledgeBankAccessGrant.expiresAt,
  note: knowledgeBankAccessGrant.note,
  createdAt: knowledgeBankAccessGrant.createdAt,
  updatedAt: knowledgeBankAccessGrant.updatedAt,
};

export async function listAll(
  conn: DbOrTx,
  input: ListKnowledgeBankAccessInput,
  now: Date,
): Promise<KnowledgeBankAccessListRow[]> {
  const conditions = [];
  const search = input.search?.trim();

  if (input.status === "active") {
    conditions.push(gt(knowledgeBankAccessGrant.expiresAt, now));
  } else if (input.status === "expired") {
    conditions.push(lte(knowledgeBankAccessGrant.expiresAt, now));
  }

  if (search) {
    const pattern = `%${escapeLikePattern(search)}%`;
    conditions.push(or(ilike(user.email, pattern), ilike(user.name, pattern)));
  }

  return conn
    .select(listColumns)
    .from(knowledgeBankAccessGrant)
    .innerJoin(user, eq(knowledgeBankAccessGrant.userId, user.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(
      desc(knowledgeBankAccessGrant.expiresAt),
      asc(user.email),
    ) as Promise<KnowledgeBankAccessListRow[]>;
}

export async function getById(
  conn: DbOrTx,
  id: string,
): Promise<KnowledgeBankAccessGrantRow | null> {
  const [row] = await conn
    .select()
    .from(knowledgeBankAccessGrant)
    .where(eq(knowledgeBankAccessGrant.id, id))
    .limit(1);
  return row ?? null;
}

export async function getListItemById(
  conn: DbOrTx,
  id: string,
): Promise<KnowledgeBankAccessListRow | null> {
  const [row] = await conn
    .select(listColumns)
    .from(knowledgeBankAccessGrant)
    .innerJoin(user, eq(knowledgeBankAccessGrant.userId, user.id))
    .where(eq(knowledgeBankAccessGrant.id, id))
    .limit(1);
  return row ?? null;
}

export async function getByUserId(
  conn: DbOrTx,
  userId: string,
): Promise<KnowledgeBankAccessGrantRow | null> {
  const [row] = await conn
    .select()
    .from(knowledgeBankAccessGrant)
    .where(eq(knowledgeBankAccessGrant.userId, userId))
    .limit(1);
  return row ?? null;
}

export async function getActiveByUserId(
  conn: DbOrTx,
  userId: string,
  now: Date,
): Promise<KnowledgeBankAccessGrantRow | null> {
  const [row] = await conn
    .select()
    .from(knowledgeBankAccessGrant)
    .where(
      and(
        eq(knowledgeBankAccessGrant.userId, userId),
        gt(knowledgeBankAccessGrant.expiresAt, now),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function findUserByEmail(
  conn: DbOrTx,
  email: string,
): Promise<StudentIdentityRow | null> {
  const [row] = await conn
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    })
    .from(user)
    .where(sql`lower(${user.email}) = ${email.toLowerCase()}`)
    .limit(1);
  return row ?? null;
}

export async function insert(
  conn: DbOrTx,
  values: {
    userId: string;
    grantedByUserId: string;
    expiresAt: Date;
    note: string | null;
  },
): Promise<KnowledgeBankAccessGrantRow> {
  const [row] = await conn
    .insert(knowledgeBankAccessGrant)
    .values(values)
    .returning();
  return row!;
}

export async function updateDetails(
  conn: DbOrTx,
  id: string,
  values: { expiresAt: Date; note: string | null },
): Promise<KnowledgeBankAccessGrantRow | null> {
  const [row] = await conn
    .update(knowledgeBankAccessGrant)
    .set(values)
    .where(eq(knowledgeBankAccessGrant.id, id))
    .returning();
  return row ?? null;
}

export async function remove(
  conn: DbOrTx,
  id: string,
): Promise<KnowledgeBankAccessGrantRow | null> {
  const [row] = await conn
    .delete(knowledgeBankAccessGrant)
    .where(eq(knowledgeBankAccessGrant.id, id))
    .returning();
  return row ?? null;
}

export function createAdminKnowledgeBankRepo() {
  return {
    listAll,
    getById,
    getListItemById,
    getByUserId,
    getActiveByUserId,
    findUserByEmail,
    insert,
    updateDetails,
    remove,
  };
}

export type AdminKnowledgeBankRepo = ReturnType<
  typeof createAdminKnowledgeBankRepo
>;
