import type { DbOrTx } from "../../lib/tx";

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
