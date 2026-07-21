import type { DbType } from "../../lib/db";
import type { AuditRecordParams } from "../audit/audit.service";
import type {
  WalletSnapshot,
  CompensateParams,
} from "../wallet/wallet.service";
import { createRefundRepo } from "./refund.repo";
import { createRefundService } from "./refund.service";
import { createRefundHandler } from "./refund.handler";
import type { RefundRepo } from "./refund.repo";
import type { RefundService } from "./refund.service";
import type { RefundHandler } from "./refund.handler";

export type RefundModule = ReturnType<typeof createRefundModule>;

interface RefundAuditPort {
  record(params: AuditRecordParams): Promise<void>;
}

interface RefundWalletPort {
  getById(db: unknown, walletId: string): Promise<WalletSnapshot | null>;
  compensate(db: unknown, params: CompensateParams): Promise<WalletSnapshot>;
  listLedger(
    walletId: string,
    opts?: {
      cursor?: string;
      limit?: number;
      bookingId?: string;
      eventKey?: string;
    },
  ): Promise<{ items: unknown[]; nextCursor: string | null }>;
}

export function createRefundModule(deps: {
  db: DbType;
  audit: RefundAuditPort;
  wallet: RefundWalletPort;
  repo?: RefundRepo;
}) {
  const repo = deps.repo ?? createRefundRepo(deps.db);
  const service = createRefundService({
    db: deps.db,
    repo,
    wallet: deps.wallet,
    auditPort: deps.audit,
  });
  const handler = createRefundHandler({ refundService: service });
  return { service, handler, repo };
}

export { createRefundRepo } from "./refund.repo";
export type { RefundService, RefundHandler, RefundRepo };
