import type { DbType } from "../../lib/db";
import type { DbOrTx } from "../../lib/tx";
import type { AuditRecordParams } from "../audit/audit.service";
import type {
  WalletSnapshot,
  LedgerEntryRow,
  LedgerQueryOptions,
} from "../wallet/wallet.service";
import { createAdminRepo } from "./admin.repo";
import { createAdminService } from "./admin.service";
import { createAdminHandler } from "./admin.handler";
import type { AdminService } from "./admin.service";
import type { AdminHandler } from "./admin.handler";

export type AdminModule = ReturnType<typeof createAdminModule>;

export interface AdminAuditPort {
  record(params: AuditRecordParams): Promise<void>;
}

export interface AdminWalletPort {
  getByUserId(db: DbOrTx, userId: string): Promise<WalletSnapshot | null>;
  listLedger(
    walletId: string,
    opts?: LedgerQueryOptions,
  ): Promise<{ items: LedgerEntryRow[]; nextCursor: string | null }>;
}

export function createAdminModule(deps: {
  db: DbType;
  audit: AdminAuditPort;
  wallet: AdminWalletPort;
}) {
  const repo = createAdminRepo();
  const service = createAdminService({
    adminRepo: repo,
    auditPort: deps.audit,
    db: deps.db,
    wallet: deps.wallet,
  });
  const handler = createAdminHandler(service);
  return { service, handler };
}

export type { AdminService, AdminHandler };
