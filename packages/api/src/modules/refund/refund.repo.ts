import { eq } from "drizzle-orm";
import { paymentRecord, refundRecord } from "@cogito-app/db/schema";
import type { DbOrTx } from "../../lib/tx";

export type RefundRepo = ReturnType<typeof createRefundRepo>;

async function insertRefundRecord(
  conn: DbOrTx,
  record: {
    paymentId: string | null;
    walletId: string;
    amountIdr: number;
    marks: number;
    reason: string;
    actorId?: string;
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
    })
    .returning();
  return inserted;
}

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
