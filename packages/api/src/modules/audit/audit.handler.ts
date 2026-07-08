import type {
  AuditPort,
  AuditRecordParams,
} from "../../shared/ports/audit.port";
import type { AuditRepo } from "./audit.repo";

export type AuditHandler = ReturnType<typeof createAuditHandler>;

export function createAuditHandler(repo: AuditRepo): AuditPort {
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
