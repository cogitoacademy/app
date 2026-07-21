import type { DbType } from "../../lib/db";
import type { AuditRecordParams } from "../audit/audit.service";
import type {
  WalletSnapshot,
  ReleaseParams,
  CompensateParams,
} from "../wallet/wallet.service";
import type { RefundRepo } from "../refund/refund.repo";
import { createAdminBookingRepo } from "./admin-booking.repo";
import { createAdminBookingService } from "./admin-booking.service";
import { createAdminBookingHandler } from "./admin-booking.handler";
import type { AdminBookingService } from "./admin-booking.service";
import type { AdminBookingHandler } from "./admin-booking.handler";

export type AdminBookingModule = ReturnType<typeof createAdminBookingModule>;

interface AdminBookingAuditPort {
  record(params: AuditRecordParams): Promise<void>;
}

interface AdminBookingWalletPort {
  getByUserId(db: unknown, userId: string): Promise<WalletSnapshot | null>;
  release(db: unknown, params: ReleaseParams): Promise<WalletSnapshot>;
  compensate(db: unknown, params: CompensateParams): Promise<WalletSnapshot>;
}

export function createAdminBookingModule(deps: {
  db: DbType;
  audit: AdminBookingAuditPort;
  wallet: AdminBookingWalletPort;
  refundRepo: RefundRepo;
}) {
  const repo = createAdminBookingRepo();
  const service = createAdminBookingService({
    db: deps.db,
    repo,
    auditPort: deps.audit,
    wallet: deps.wallet,
    refundRepo: deps.refundRepo,
  });
  const handler = createAdminBookingHandler(service);
  return { service, handler };
}

export type { AdminBookingService, AdminBookingHandler };
