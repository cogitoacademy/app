import { auditLog } from "@cogito-app/db/schema";
import type { DbOrTx } from "../../lib/tx";

export type AuditRepo = ReturnType<typeof createAuditRepo>;

/**
 * Inserts an audit log entry.
 *
 * @param conn - the database connection or active transaction
 * @param params - the audit log fields (actor, action, target, before/after state, details)
 */
export async function insertAuditLog(
  conn: DbOrTx,
  params: {
    actorId: string | null;
    actorType: string;
    action: string;
    targetId?: string;
    targetType: string;
    beforeState?: Record<string, unknown>;
    afterState?: Record<string, unknown>;
    details?: Record<string, unknown>;
  },
): Promise<void> {
  await conn.insert(auditLog).values({
    actorId: params.actorId,
    actorType: params.actorType,
    action: params.action,
    targetId: params.targetId,
    targetType: params.targetType,
    beforeState: params.beforeState,
    afterState: params.afterState,
    details: params.details,
  });
}

export function createAuditRepo() {
  return { insertAuditLog };
}
