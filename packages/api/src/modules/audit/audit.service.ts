import type { DbOrTx } from "../../lib/tx";
import type { AuditRepo } from "./audit.repo";

export type AuditActorType = "admin" | "tutor" | "student" | "system";

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

export interface AuditPort {
  record(params: AuditRecordParams): Promise<void>;
}

export type AuditService = ReturnType<typeof createAuditService>;

export function createAuditService(repo: AuditRepo): AuditPort {
  async function record(params: AuditRecordParams): Promise<void> {
    await repo.insertAuditLog(params.db, {
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
