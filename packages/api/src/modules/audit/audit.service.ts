import { auditLog } from "@cogito-app/db/schema";
import type { AuditPort, AuditActorType } from "../../shared/ports/audit.port";
import type { DbOrTx } from "../../lib/tx";

export interface AuditRecordParams {
  db: DbOrTx;
  actorId: string | null;
  actorType: AuditActorType;
  action: string;
  targetId?: string;
  targetType: string;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
  details?: Record<string, unknown>;
}

export type AuditService = ReturnType<typeof createAuditService>;

export function createAuditService(): AuditPort {
  async function record(params: AuditRecordParams): Promise<void> {
    await params.db.insert(auditLog).values({
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

  return { record };
}
