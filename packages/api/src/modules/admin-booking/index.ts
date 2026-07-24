import type { DbType } from "../../lib/db";
import type { DbOrTx } from "../../lib/tx";
import type { AuditRecordParams } from "../audit/audit.service";
import type {
  WalletSnapshot,
  ReleaseParams,
  CompensateParams,
} from "../wallet/wallet.service";
import { createAdminBookingRepo } from "./admin-booking.repo";
import { createAdminBookingService } from "./admin-booking.service";
import { createAdminBookingHandler } from "./admin-booking.handler";
import type { AdminBookingService } from "./admin-booking.service";
import type { AdminBookingHandler } from "./admin-booking.handler";

export type AdminBookingModule = ReturnType<typeof createAdminBookingModule>;

export interface AdminBookingAuditPort {
  record(params: AuditRecordParams): Promise<void>;
}

export interface AdminBookingWalletPort {
  getByUserId(db: DbOrTx, userId: string): Promise<WalletSnapshot | null>;
  release(db: DbOrTx, params: ReleaseParams): Promise<WalletSnapshot>;
  compensate(db: DbOrTx, params: CompensateParams): Promise<WalletSnapshot>;
}

export interface AdminBookingRefundPort {
  createRefundRecord(
    db: DbOrTx,
    params: {
      paymentId: string | null;
      walletId: string;
      amountIdr: number;
      marks: number;
      reason: string;
      actorId?: string;
    },
  ): Promise<void>;
}

export function createAdminBookingModule(deps: {
  db: DbType;
  audit: AdminBookingAuditPort;
  wallet: AdminBookingWalletPort;
  refund: AdminBookingRefundPort;
}) {
  const repo = createAdminBookingRepo();
  const service = createAdminBookingService({
    db: deps.db,
    repo,
    auditPort: deps.audit,
    wallet: deps.wallet,
    refund: deps.refund,
  });
  const handler = createAdminBookingHandler(service);
  return { service, handler };
}

export type { AdminBookingService, AdminBookingHandler };
