import type {
  AuditPort,
  AuditRecordParams,
} from "../../shared/ports/audit.port";
import type { AuditRepo } from "./audit.repo";

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
