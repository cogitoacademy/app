import type { DbType } from "../../lib/db";
import type { AuditRecordParams } from "../audit/audit.service";
import { createAdminMarkPackageRepo } from "./admin-mark-package.repo";
import { createAdminMarkPackageService } from "./admin-mark-package.service";
import { createAdminMarkPackageHandler } from "./admin-mark-package.handler";
import type { AdminMarkPackageService } from "./admin-mark-package.service";
import type { AdminMarkPackageHandler } from "./admin-mark-package.handler";

export type AdminMarkPackageModule = ReturnType<
  typeof createAdminMarkPackageModule
>;

export interface AdminMarkPackageAuditPort {
  record(params: AuditRecordParams): Promise<void>;
}

export function createAdminMarkPackageModule(deps: {
  db: DbType;
  audit: AdminMarkPackageAuditPort;
}) {
  const repo = createAdminMarkPackageRepo();
  const service = createAdminMarkPackageService({
    db: deps.db,
    repo,
    auditPort: deps.audit,
  });
  const handler = createAdminMarkPackageHandler(service);
  return { service, handler };
}

export type { AdminMarkPackageService, AdminMarkPackageHandler };
