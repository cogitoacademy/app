import type { DbType } from "../../lib/db";
import type { AuditRecordParams } from "../audit/audit.service";
import { createAdminTutorRepo } from "./admin-tutor.repo";
import { createAdminTutorService } from "./admin-tutor.service";
import { createAdminTutorHandler } from "./admin-tutor.handler";
import type { AdminTutorService } from "./admin-tutor.service";
import type { AdminTutorHandler } from "./admin-tutor.handler";

export type AdminTutorModule = ReturnType<typeof createAdminTutorModule>;

export interface AdminTutorAuditPort {
  record(params: AuditRecordParams): Promise<void>;
}

export function createAdminTutorModule(deps: {
  db: DbType;
  audit: AdminTutorAuditPort;
}) {
  const repo = createAdminTutorRepo();
  const service = createAdminTutorService({
    adminTutorRepo: repo,
    auditPort: deps.audit,
    db: deps.db,
  });
  const handler = createAdminTutorHandler(service);
  return { service, handler };
}

export type { AdminTutorService, AdminTutorHandler };
