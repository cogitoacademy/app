import type { DbType } from "../../lib/db";
import type { DbOrTx } from "../../lib/tx";
import type { AuditRecordParams } from "../audit/audit.service";
import type { NotificationWriteParams } from "../notification/notification.service";
import type { MeetingEvent } from "../meeting/meeting.types";
import type {
  WalletSnapshot,
  ReleaseParams,
  DeductParams,
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
  deduct(db: DbOrTx, params: DeductParams): Promise<WalletSnapshot>;
  compensate(db: DbOrTx, params: CompensateParams): Promise<WalletSnapshot>;
  sumCreditedMarks(db: DbOrTx, walletId: string): Promise<number>;
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
      providerEventId?: string;
    },
  ): Promise<void>;
  /**
   * Initiates a provider-side refund (X1). Wired to the active payment
   * provider (Xendit real refund / stub mock id). The returned provider
   * refund id is stored on the refundRecord row.
   */
  refundWithProvider?(
    paymentRequestId: string,
    amountIdr: number,
    reason?: string,
  ): Promise<{ providerRefundId: string }>;
}

export interface AdminBookingNotificationPort {
  writeBestEffort(params: NotificationWriteParams): Promise<void>;
}

export interface AdminBookingMeetingPort {
  setManualLink(bookingId: string, url: string): Promise<MeetingEvent>;
  cancelEvent(bookingId: string): Promise<void>;
}

export function createAdminBookingModule(deps: {
  db: DbType;
  audit: AdminBookingAuditPort;
  wallet: AdminBookingWalletPort;
  refund: AdminBookingRefundPort;
  notification?: AdminBookingNotificationPort;
  meeting: AdminBookingMeetingPort;
}) {
  const repo = createAdminBookingRepo();
  const service = createAdminBookingService({
    db: deps.db,
    repo,
    auditPort: deps.audit,
    wallet: deps.wallet,
    refund: deps.refund,
    notification: deps.notification,
    meeting: deps.meeting,
  });
  const handler = createAdminBookingHandler(service);
  return { service, handler };
}

export type { AdminBookingService, AdminBookingHandler };
