import type { DbType } from "../../lib/db";
import type { DbOrTx } from "../../lib/tx";
import {
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
  ACTOR_TYPE,
} from "../../shared/constants";
import { badRequest } from "../../lib/errors";
import type {
  WalletSnapshot,
  CompensateParams,
} from "../wallet/wallet.service";
import type { AuditRecordParams } from "../audit/audit.service";
import type { RefundRepo } from "./refund.repo";

interface RefundWalletPort {
  getById(db: DbOrTx, walletId: string): Promise<WalletSnapshot | null>;
  compensate(db: DbOrTx, params: CompensateParams): Promise<WalletSnapshot>;
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

interface RefundAuditPort {
  record(params: AuditRecordParams): Promise<void>;
}

export type RefundService = ReturnType<typeof createRefundService>;

export function createRefundService(deps: {
  db: DbType;
  repo: RefundRepo;
  wallet: RefundWalletPort;
  auditPort: RefundAuditPort;
}) {
  const { db, wallet, auditPort, repo } = deps;

  async function createCorrection(
    adminId: string,
    input: {
      walletId: string;
      amount: number;
      type: "compensate_credit" | "compensate_deduct";
      reason: string;
      bookingId?: string;
    },
  ) {
    if (input.amount <= 0) throw badRequest("Amount must be positive");
    const walletSnapshot = await wallet.getById(db, input.walletId);
    if (!walletSnapshot) throw new Error("Wallet not found");

    const beforeState = {
      totalBalance: walletSnapshot.totalBalance,
      heldBalance: walletSnapshot.heldBalance,
      availableBalance: walletSnapshot.availableBalance,
    };

    await db.transaction(async (tx) => {
      const walletResult = await wallet.compensate(tx, {
        walletId: input.walletId,
        amount: input.amount,
        eventKey: `correction.${input.type}.${input.walletId}.${Date.now()}`,
        actorType: ACTOR_TYPE.ADMIN,
        reason: input.reason,
        type: input.type,
        bookingId: input.bookingId,
      });

      const afterState = {
        totalBalance: walletResult.totalBalance,
        heldBalance: walletResult.heldBalance,
        availableBalance: walletResult.availableBalance,
      };

      await repo.insertRefundRecord(tx, {
        paymentId: input.bookingId ?? null,
        walletId: input.walletId,
        amountIdr: 0,
        marks: input.amount,
        reason: input.reason,
        actorId: adminId,
      });

      await auditPort.record({
        db: tx,
        actorId: adminId,
        actorType: ACTOR_TYPE.ADMIN,
        action: `correction_${input.type}`,
        targetId: input.walletId,
        targetType: "wallet",
        beforeState,
        afterState,
        details: {
          amount: input.amount,
          reason: input.reason,
          bookingId: input.bookingId,
        },
      });

      return walletResult;
    });

    return { walletId: input.walletId, type: input.type, amount: input.amount };
  }

  async function listCorrections(input: {
    walletId: string;
    limit?: number;
    cursor?: string;
  }) {
    const limit = Math.min(input.limit ?? DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT);
    const result = await wallet.listLedger(input.walletId, {
      limit: limit + 1,
      cursor: input.cursor,
    });

    const items = (result.items as { entryType: string }[]).filter(
      (entry) =>
        entry.entryType === "compensate_credit" ||
        entry.entryType === "compensate_deduct",
    );

    return {
      items: items.slice(0, limit),
      nextCursor: result.nextCursor,
    };
  }

  return { createCorrection, listCorrections };
}
