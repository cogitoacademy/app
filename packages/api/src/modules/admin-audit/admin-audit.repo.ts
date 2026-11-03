import { and, desc, eq, gte, lt, lte, or } from "drizzle-orm";
import { auditLog, user } from "@cogito-app/db/schema";

import type { DbOrTx } from "../../lib/tx";

export type AuditLogCursor = {
  createdAt: Date;
  id: string;
};

export type AuditLogListRow = {
  id: string;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  actorType: string;
  action: string;
  targetType: string;
  targetId: string | null;
  beforeState: unknown;
  afterState: unknown;
  details: Record<string, unknown> | null;
  createdAt: Date;
};

export type AuditLogListQuery = {
  limit: number;
  cursor: AuditLogCursor | null;
  action: string | null;
  targetType: string | null;
  targetId: string | null;
  actorId: string | null;
  dateFrom: Date | null;
  dateTo: Date | null;
};

const listColumns = {
  id: auditLog.id,
  actorId: auditLog.actorId,
  actorName: user.name,
  actorEmail: user.email,
  actorType: auditLog.actorType,
  action: auditLog.action,
  targetType: auditLog.targetType,
  targetId: auditLog.targetId,
  beforeState: auditLog.beforeState,
  afterState: auditLog.afterState,
  details: auditLog.details,
  createdAt: auditLog.createdAt,
};

export async function listPage(
  conn: DbOrTx,
  query: AuditLogListQuery,
): Promise<AuditLogListRow[]> {
  const conditions = [];

  if (query.action) conditions.push(eq(auditLog.action, query.action));
  if (query.targetType)
    conditions.push(eq(auditLog.targetType, query.targetType));
  if (query.targetId) conditions.push(eq(auditLog.targetId, query.targetId));
  if (query.actorId) conditions.push(eq(auditLog.actorId, query.actorId));
  if (query.dateFrom) conditions.push(gte(auditLog.createdAt, query.dateFrom));
  if (query.dateTo) conditions.push(lte(auditLog.createdAt, query.dateTo));
  if (query.cursor) {
    conditions.push(
      or(
        lt(auditLog.createdAt, query.cursor.createdAt),
        and(
          eq(auditLog.createdAt, query.cursor.createdAt),
          lt(auditLog.id, query.cursor.id),
        ),
      ),
    );
  }

  const rows = await conn
    .select(listColumns)
    .from(auditLog)
    .leftJoin(user, eq(auditLog.actorId, user.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(query.limit + 1);

  return rows as AuditLogListRow[];
}

export function createAdminAuditRepo() {
  return { listPage };
}

export type AdminAuditRepo = ReturnType<typeof createAdminAuditRepo>;
