import type { DbType } from "../../lib/db";
import type { AuditRecordParams } from "../audit/audit.service";
import { createAdminRepo } from "./admin.repo";
import { createAdminService } from "./admin.service";
import { createAdminHandler } from "./admin.handler";
import type { AdminService } from "./admin.service";
import type { AdminHandler } from "./admin.handler";

export type AdminModule = ReturnType<typeof createAdminModule>;

interface AdminAuditPort {
  record(params: AuditRecordParams): Promise<void>;
}

export function createAdminModule(deps: { db: DbType; audit: AdminAuditPort }) {
  const repo = createAdminRepo();
  const service = createAdminService({
    adminRepo: repo,
    auditPort: deps.audit,
    db: deps.db,
  });
  const handler = createAdminHandler(service);
  return { service, handler };
}

export type { AdminService, AdminHandler };
