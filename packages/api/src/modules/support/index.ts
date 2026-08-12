import type { DbType } from "../../lib/db";
import type { AuditRecordParams } from "../audit/audit.service";
import type { NotificationWriteParams } from "../notification/notification.service";
import { createSupportRepo } from "./support.repo";
import { createSupportService } from "./support.service";
import { createSupportHandler } from "./support.handler";
import type { SupportService } from "./support.service";
import type { SupportHandler } from "./support.handler";

export type SupportModule = ReturnType<typeof createSupportModule>;

export interface SupportNotificationPort {
  writeBestEffort(params: NotificationWriteParams): Promise<void>;
}

export interface SupportAuditPort {
  record(params: AuditRecordParams): Promise<void>;
}

export function createSupportModule(deps: {
  db: DbType;
  notification: SupportNotificationPort;
  audit: SupportAuditPort;
}) {
  const repo = createSupportRepo();
  const service = createSupportService({
    supportRepo: repo,
    notification: deps.notification,
    audit: deps.audit,
    db: deps.db,
  });
  const handler = createSupportHandler({ supportService: service });
  return { service, handler };
}

export type { SupportService, SupportHandler };
