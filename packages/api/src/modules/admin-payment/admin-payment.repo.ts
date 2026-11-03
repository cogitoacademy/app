import { and, count, desc, eq, gte, ilike, lt, lte, or } from "drizzle-orm";
import { paymentRecord, user } from "@cogito-app/db/schema";

import type { DbOrTx } from "../../lib/tx";
import type {
  AdminPaymentRefundKind,
  AdminPaymentStatus,
} from "./admin-payment.types";

export type AdminPaymentFilters = {
  status?: AdminPaymentStatus;
  userId?: string;
  query?: string;
  dateFrom?: Date;
  dateTo?: Date;
};

export type AdminPaymentCursor = {
  createdAt: Date;
  id: string;
};

export type AdminPaymentListRow = {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  amountIdr: number;
  marks: number;
  status: string;
  provider: string;
  providerReference: string;
  purchaseLabel: string | null;
  createdAt: Date;
  providerSuccessAt: Date | null;
  providerRefundKind: AdminPaymentRefundKind | null;
  providerRefundAmountIdr: number | null;
};

const listColumns = {
  id: paymentRecord.id,
  userId: paymentRecord.userId,
  userName: user.name,
  userEmail: user.email,
  amountIdr: paymentRecord.amountIdr,
  marks: paymentRecord.marks,
  status: paymentRecord.status,
  provider: paymentRecord.provider,
  providerReference: paymentRecord.providerReference,
  purchaseLabel: paymentRecord.purchaseLabel,
  createdAt: paymentRecord.createdAt,
  providerSuccessAt: paymentRecord.providerSuccessAt,
  providerRefundKind: paymentRecord.providerRefundKind,
  providerRefundAmountIdr: paymentRecord.providerRefundAmountIdr,
};

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function buildConditions(
  filters: AdminPaymentFilters,
  cursor?: AdminPaymentCursor,
) {
  const conditions = [];

  if (filters.status) {
    conditions.push(eq(paymentRecord.status, filters.status));
  }
  if (filters.userId) {
    conditions.push(eq(paymentRecord.userId, filters.userId));
  }
  if (filters.dateFrom) {
    conditions.push(gte(paymentRecord.createdAt, filters.dateFrom));
  }
  if (filters.dateTo) {
    conditions.push(lte(paymentRecord.createdAt, filters.dateTo));
  }

  const search = filters.query?.trim();
  if (search) {
    const pattern = `%${escapeLikePattern(search)}%`;
    conditions.push(
      or(
        ilike(user.name, pattern),
        ilike(user.email, pattern),
        ilike(paymentRecord.providerReference, pattern),
      ),
    );
  }

  if (cursor) {
    conditions.push(
      or(
        lt(paymentRecord.createdAt, cursor.createdAt),
        and(
          eq(paymentRecord.createdAt, cursor.createdAt),
          lt(paymentRecord.id, cursor.id),
        ),
      ),
    );
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

export async function listRows(
  conn: DbOrTx,
  filters: AdminPaymentFilters,
  limit: number,
  cursor?: AdminPaymentCursor,
): Promise<AdminPaymentListRow[]> {
  const rows = await conn
    .select(listColumns)
    .from(paymentRecord)
    .innerJoin(user, eq(paymentRecord.userId, user.id))
    .where(buildConditions(filters, cursor))
    .orderBy(desc(paymentRecord.createdAt), desc(paymentRecord.id))
    .limit(limit + 1);

  return rows as AdminPaymentListRow[];
}

export async function countRows(
  conn: DbOrTx,
  filters: AdminPaymentFilters,
): Promise<number> {
  const [row] = await conn
    .select({ value: count() })
    .from(paymentRecord)
    .innerJoin(user, eq(paymentRecord.userId, user.id))
    .where(buildConditions(filters));

  return Number(row?.value ?? 0);
}

export function createAdminPaymentRepo() {
  return { listRows, countRows };
}

export type AdminPaymentRepo = ReturnType<typeof createAdminPaymentRepo>;
