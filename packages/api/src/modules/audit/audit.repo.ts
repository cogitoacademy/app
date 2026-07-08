import { auditLog } from "@cogito-app/db/schema";
import type { DbOrTx } from "../../lib/tx";

export type AuditRepo = ReturnType<typeof createAuditRepo>;

export function createAuditRepo() {
  async function insertAuditLog(
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

  return { insertAuditLog };
}
