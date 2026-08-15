import type { DbType } from "../../lib/db";
import type { DbOrTx } from "../../lib/tx";
import { createHash } from "node:crypto";
import {
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
  ACTOR_TYPE,
} from "../../shared/constants";
import { WalletNotFoundError } from "./refund.errors";
import type { RefundRepo } from "./refund.repo";
import type { RefundWalletPort, RefundAuditPort } from "./index";

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
    return db.transaction(async (tx) => {
      const walletSnapshot = await wallet.getById(tx, input.walletId);
      if (!walletSnapshot) throw new WalletNotFoundError(input.walletId);

      const beforeState = {
        totalBalance: walletSnapshot.totalBalance,
        heldBalance: walletSnapshot.heldBalance,
        availableBalance: walletSnapshot.availableBalance,
      };

      // Deterministic event key derived from the correction payload so a
      // retried request can never apply the same correction twice (M7). The
      // ledger unique index (wallet_id, event_key, source_reference) guards
      // the write, so sourceReference is populated too (NULLs are distinct in
      // Postgres unique indexes and would bypass the guard).
      const payloadKey = JSON.stringify({
        type: input.type,
        walletId: input.walletId,
        amount: input.amount,
        reason: input.reason,
        bookingId: input.bookingId ?? null,
      });
      const eventKey = `correction.${input.type}.${input.walletId}.${createHash("sha256").update(payloadKey).digest("hex").slice(0, 32)}`;
      const sourceReference = `correction:${input.walletId}:${createHash("sha256").update(payloadKey).digest("hex").slice(0, 32)}`;

      const walletResult = await wallet.compensate(tx, {
        walletId: input.walletId,
        amount: input.amount,
        eventKey,
        sourceReference,
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
        paymentId: null,
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

      return {
        walletId: input.walletId,
        type: input.type,
        amount: input.amount,
      };
    });
  }

  async function listCorrections(input: {
    walletId: string;
    limit?: number;
    cursor?: string;
  }) {
    const limit = Math.min(input.limit ?? DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT);
    // Filter in SQL so the cursor is derived from the filtered result set —
    // in-memory filtering could skip corrections across page boundaries (M15).
    const result = await wallet.listLedger(input.walletId, {
      limit: limit + 1,
      cursor: input.cursor,
      entryType: ["compensate_credit", "compensate_deduct"],
    });

    return {
      items: result.items,
      nextCursor: result.nextCursor,
    };
  }

  async function createRefundRecord(
    conn: DbOrTx,
    params: {
      paymentId: string | null;
      walletId: string;
      amountIdr: number;
      marks: number;
      reason: string;
      actorId?: string;
    },
  ): Promise<void> {
    await repo.insertRefundRecord(conn, params);
  }

  return { createCorrection, listCorrections, createRefundRecord };
}
