import type { DbType } from "../../lib/db";
import type { AuditRecordParams } from "../audit/audit.service";
import { createAdminKnowledgeBankHandler } from "./admin-knowledge-bank.handler";
import { createAdminKnowledgeBankRepo } from "./admin-knowledge-bank.repo";
import { createAdminKnowledgeBankService } from "./admin-knowledge-bank.service";

export type AdminKnowledgeBankModule = ReturnType<
  typeof createAdminKnowledgeBankModule
>;

export interface AdminKnowledgeBankAuditPort {
  record(params: AuditRecordParams): Promise<void>;
}

export function createAdminKnowledgeBankModule(deps: {
  db: DbType;
  audit: AdminKnowledgeBankAuditPort;
}) {
  const repo = createAdminKnowledgeBankRepo();
  const service = createAdminKnowledgeBankService({
    db: deps.db,
    repo,
    auditPort: deps.audit,
  });
  const handler = createAdminKnowledgeBankHandler(service);
  return { repo, service, handler };
}

export type {
  AdminKnowledgeBankService,
  KnowledgeBankAccessPort,
  KnowledgeBankAccessView,
} from "./admin-knowledge-bank.service";
export type { AdminKnowledgeBankHandler } from "./admin-knowledge-bank.handler";
