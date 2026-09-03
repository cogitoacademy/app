import { eq, and, desc, inArray } from "drizzle-orm";
import { paymentRecord, markPackage } from "@cogito-app/db/schema";
import type { DbType } from "../../lib/db";
import type { DbOrTx } from "../../lib/tx";
import { PAYMENT_STATUS } from "../../shared/constants";

export type PaymentRepo = ReturnType<typeof createPaymentRepo>;

/**
 * Finds a mark package by its code.
 *
 * @param conn - the database connection or active transaction
 * @param code - the package code
 * @returns the package row, or null
 */
export async function findPackageByCode(conn: DbOrTx, code: string) {
  const [pkg] = await conn
    .select()
    .from(markPackage)
    .where(eq(markPackage.code, code))
    .limit(1);
  return pkg ?? null;
}

/**
 * Finds a payment by its provider reference (used for idempotency).
 *
 * @param conn - the database connection or active transaction
 * @param providerReference - the provider's reference
 * @returns the payment row, or null
 */
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

/**
 * Finds the most recent payment attempt for one user's package and provider.
 *
 * A package may be purchased repeatedly. The latest PENDING attempt remains
 * idempotent (the checkout can be resumed), while terminal attempts are kept
 * as history and the service creates a new payment record for the next try.
 */
export async function findLatestPaymentByUserAndPackage(
  conn: DbOrTx,
  userId: string,
  packageId: string,
  provider: string,
) {
  const [record] = await conn
    .select()
    .from(paymentRecord)
    .where(
      and(
        eq(paymentRecord.userId, userId),
        eq(paymentRecord.packageId, packageId),
        eq(paymentRecord.provider, provider),
      ),
    )
    .orderBy(desc(paymentRecord.createdAt), desc(paymentRecord.id))
    .limit(1);
  return record ?? null;
}

/**
 * Finds a payment by id.
 *
 * @param conn - the database connection or active transaction
 * @param id - the payment id
 * @returns the payment row, or null
 */
export async function findPaymentById(conn: DbOrTx, id: string) {
  const [record] = await conn
    .select()
    .from(paymentRecord)
    .where(eq(paymentRecord.id, id))
    .limit(1);
  return record ?? null;
}

/**
 * Finds a payment by provider event id (for webhook deduplication).
 *
 * @param conn - the database connection or active transaction
 * @param providerEventId - the provider's event id
 * @returns the payment row, or null
 */
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

/**
 * Inserts a payment record.
 *
 * @param conn - the database connection or active transaction
 * @param values - the payment fields
 */
export async function insertPayment(
  conn: DbOrTx,
  values: typeof paymentRecord.$inferInsert,
) {
  // B6: the provider reference is unique — a concurrent writer that already
  // inserted the same reference (check-then-insert race) is a no-op.
  const [inserted] = await conn
    .insert(paymentRecord)
    .values(values)
    .onConflictDoNothing({ target: paymentRecord.providerReference })
    .returning();
  return inserted ?? null;
}

/**
 * Updates a payment's status and related webhook fields.
 *
 * @param conn - the database connection or active transaction
 * @param id - the payment id
 * @param data - the status and optional receipt/failure fields
 */
export async function updatePaymentStatus(
  conn: DbOrTx,
  id: string,
  data: {
    status: string;
    providerEventId?: string;
    providerRequestId?: string;
    checkoutUrl?: string | null;
    receiptUrl?: string | null;
    failureReason?: string | null;
  },
) {
  await conn.update(paymentRecord).set(data).where(eq(paymentRecord.id, id));
}

/**
 * Conditionally updates a payment to a new status, but only when the row is
 * still in a credit state (PAID/SETTLED). Returns the updated row, or null
 * when the payment was already transitioned out of a credit state (e.g. an
 * admin refund committed first — B2).
 *
 * @param conn - the database connection or active transaction
 * @param id - the payment id
 * @param data - the status and optional webhook fields
 */
export async function updatePaymentStatusIfInCreditState(
  conn: DbOrTx,
  id: string,
  data: {
    status: string;
    providerEventId?: string;
    failureReason?: string | null;
  },
) {
  const [updated] = await conn
    .update(paymentRecord)
    .set({ ...data, updatedAt: new Date() })
    .where(
      and(
        eq(paymentRecord.id, id),
        inArray(paymentRecord.status, [
          PAYMENT_STATUS.PAID,
          PAYMENT_STATUS.SETTLED,
        ]),
      ),
    )
    .returning();
  return updated ?? null;
}

export function createPaymentRepo(db: DbType) {
  return {
    findPackageByCode(code: string, conn?: DbOrTx) {
      return findPackageByCode(conn ?? db, code);
    },
    findPaymentByProviderReference(providerReference: string, conn?: DbOrTx) {
      return findPaymentByProviderReference(conn ?? db, providerReference);
    },
    findLatestPaymentByUserAndPackage(
      userId: string,
      packageId: string,
      provider: string,
      conn?: DbOrTx,
    ) {
      return findLatestPaymentByUserAndPackage(
        conn ?? db,
        userId,
        packageId,
        provider,
      );
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
        providerRequestId?: string;
        checkoutUrl?: string | null;
        receiptUrl?: string | null;
        failureReason?: string | null;
      },
      conn?: DbOrTx,
    ) {
      return updatePaymentStatus(conn ?? db, id, data);
    },
    updatePaymentStatusIfInCreditState(
      id: string,
      data: {
        status: string;
        providerEventId?: string;
        failureReason?: string | null;
      },
      conn?: DbOrTx,
    ) {
      return updatePaymentStatusIfInCreditState(conn ?? db, id, data);
    },
  };
}
