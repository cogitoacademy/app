import type { DbType } from "../../lib/db";
import { createAdminAuditHandler } from "./admin-audit.handler";
import { createAdminAuditRepo } from "./admin-audit.repo";
import { createAdminAuditService } from "./admin-audit.service";

export type AdminAuditModule = ReturnType<typeof createAdminAuditModule>;

export function createAdminAuditModule(deps: { db: DbType }) {
  const repo = createAdminAuditRepo();
  const service = createAdminAuditService({ db: deps.db, repo });
  const handler = createAdminAuditHandler(service);
  return { repo, service, handler };
}

export type { AdminAuditService, AuditLogView } from "./admin-audit.service";
export type { AdminAuditHandler } from "./admin-audit.handler";
