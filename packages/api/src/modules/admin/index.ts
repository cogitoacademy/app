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
import type { BookingPayoutPort } from "../booking";
import type { EconomyService } from "../economy";
import type { NotificationWriteParams } from "../notification/notification.service";

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

export type AdminEconomyPort = EconomyService;

export interface AdminNotificationPort {
  write(params: NotificationWriteParams): Promise<void>;
}

export function createAdminModule(deps: {
  db: DbType;
  audit: AdminAuditPort;
  wallet: AdminWalletPort;
  payout: BookingPayoutPort;
  economy: AdminEconomyPort;
  notification: AdminNotificationPort;
}) {
  const repo = createAdminRepo();
  const service = createAdminService({
    adminRepo: repo,
    auditPort: deps.audit,
    db: deps.db,
    wallet: deps.wallet,
    payout: deps.payout,
    economy: deps.economy,
    notification: deps.notification,
  });
  const handler = createAdminHandler(service);
  return { service, handler };
}

export type { AdminService, AdminHandler };
