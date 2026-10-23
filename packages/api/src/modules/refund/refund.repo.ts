import { eq, sql } from "drizzle-orm";
import { paymentRecord, refundRecord } from "@cogito-app/db/schema";
import type { DbOrTx } from "../../lib/tx";

export type RefundRepo = ReturnType<typeof createRefundRepo>;

/**
 * Inserts a refund record or advances a provider transaction's cumulative
 * reconciliation row without allowing older status snapshots to reduce it.
 *
 * @param conn - the database connection or active transaction
 * @param record - the refund fields
 * @returns the inserted or updated refund row
 */
async function insertRefundRecord(
  conn: DbOrTx,
  record: {
    paymentId: string | null;
    walletId: string;
    amountIdr: number;
    marks: number;
    reason: string;
    actorId?: string;
    providerEventId?: string;
  },
) {
  const [inserted] = await conn
    .insert(refundRecord)
    .values({
      paymentId: record.paymentId ?? null,
      walletId: record.walletId,
      amountIdr: record.amountIdr,
      marks: record.marks,
      reason: record.reason,
      actorId: record.actorId ?? null,
      providerEventId: record.providerEventId ?? null,
    })
    .onConflictDoUpdate({
      target: refundRecord.providerEventId,
      set: {
        paymentId: record.paymentId ?? null,
        walletId: record.walletId,
        amountIdr: sql`greatest(${refundRecord.amountIdr}, excluded.amount_idr)`,
        marks: sql`greatest(${refundRecord.marks}, excluded.marks)`,
        reason: record.reason,
      },
    })
    .returning();
  return inserted;
}

/**
 * Updates a payment record's status.
 *
 * @param conn - the database connection or active transaction
 * @param paymentId - the payment id
 * @param status - the new status
 * @returns the updated row, or null
 */
async function updatePaymentStatus(
  conn: DbOrTx,
  paymentId: string,
  status: string,
) {
  const [updated] = await conn
    .update(paymentRecord)
    .set({ status, updatedAt: new Date() })
    .where(eq(paymentRecord.id, paymentId))
    .returning();
  return updated ?? null;
}

export function createRefundRepo() {
  return { insertRefundRecord, updatePaymentStatus };
}
