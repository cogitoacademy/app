import type { DbType } from "../../lib/db";
import type { AuditRecordParams } from "../audit/audit.service";
import { createInviteRepo } from "./invite.repo";
import { createInviteService } from "./invite.service";
import { createInviteHandler } from "./invite.handler";
import type { InviteService } from "./invite.service";
import type { InviteHandler } from "./invite.handler";

export type InviteModule = ReturnType<typeof createInviteModule>;

interface InviteAuditPort {
  record(params: AuditRecordParams): Promise<void>;
}

export function createInviteModule(deps: {
  db: DbType;
  audit: InviteAuditPort;
}) {
  const repo = createInviteRepo();
  const service = createInviteService({
    inviteRepo: repo,
    auditPort: deps.audit,
    db: deps.db,
  });
  const handler = createInviteHandler({ inviteService: service });
  return { service, handler };
}

export type { InviteService, InviteHandler };
