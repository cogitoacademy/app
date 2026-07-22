import { eq } from "drizzle-orm";
import { paymentRecord, markPackage } from "@cogito-app/db/schema";
import type { DbType } from "../../lib/db";
import type { DbOrTx } from "../../lib/tx";

export type PaymentRepo = ReturnType<typeof createPaymentRepo>;

export async function findPackageByCode(conn: DbOrTx, code: string) {
  const [pkg] = await conn
    .select()
    .from(markPackage)
    .where(eq(markPackage.code, code))
    .limit(1);
  return pkg ?? null;
}

export async function findPaymentByProviderReference(
  conn: DbOrTx,
  providerReference: string,
) {
  const [record] = await conn
    .select()
    .from(paymentRecord)
    .where(eq(paymentRecord.providerReference, providerReference))
    .limit(1);
  return record ?? null;
}

export async function findPaymentById(conn: DbOrTx, id: string) {
  const [record] = await conn
    .select()
    .from(paymentRecord)
    .where(eq(paymentRecord.id, id))
    .limit(1);
  return record ?? null;
}

export async function findPaymentByProviderEventId(
  conn: DbOrTx,
  providerEventId: string,
) {
  const [record] = await conn
    .select()
    .from(paymentRecord)
    .where(eq(paymentRecord.providerEventId, providerEventId))
    .limit(1);
  return record ?? null;
}

export async function insertPayment(
  conn: DbOrTx,
  values: typeof paymentRecord.$inferInsert,
) {
  await conn.insert(paymentRecord).values(values);
}

export async function updatePaymentStatus(
  conn: DbOrTx,
  id: string,
  data: {
    status: string;
    providerEventId?: string;
    receiptUrl?: string | null;
    failureReason?: string | null;
  },
) {
  await conn.update(paymentRecord).set(data).where(eq(paymentRecord.id, id));
}

export function createPaymentRepo(db: DbType) {
  return {
    findPackageByCode(code: string, conn?: DbOrTx) {
      return findPackageByCode(conn ?? db, code);
    },
    findPaymentByProviderReference(providerReference: string, conn?: DbOrTx) {
      return findPaymentByProviderReference(conn ?? db, providerReference);
    },
    findPaymentById(id: string, conn?: DbOrTx) {
      return findPaymentById(conn ?? db, id);
    },
    findPaymentByProviderEventId(providerEventId: string, conn?: DbOrTx) {
      return findPaymentByProviderEventId(conn ?? db, providerEventId);
    },
    insertPayment(values: typeof paymentRecord.$inferInsert, conn?: DbOrTx) {
      return insertPayment(conn ?? db, values);
    },
    updatePaymentStatus(
      id: string,
      data: {
        status: string;
        providerEventId?: string;
        receiptUrl?: string | null;
        failureReason?: string | null;
      },
      conn?: DbOrTx,
    ) {
      return updatePaymentStatus(conn ?? db, id, data);
    },
  };
}
