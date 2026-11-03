import type { DbType } from "../../lib/db";
import {
  InvalidPaymentCursorError,
  InvalidPaymentFilterError,
} from "./admin-payment.errors";
import type {
  AdminPaymentCursor,
  AdminPaymentListRow,
  AdminPaymentRepo,
} from "./admin-payment.repo";
import type {
  AdminListPaymentsInput,
  AdminListPaymentsResult,
  AdminPaymentListItem,
  AdminPaymentRefundKind,
  AdminPaymentStatus,
} from "./admin-payment.types";

const DEFAULT_LIMIT = 50;

export function parsePaymentCursor(cursor: string): AdminPaymentCursor {
  const parts = cursor.split("~");
  if (parts.length !== 2) throw new InvalidPaymentCursorError();

  const [createdAtRaw, id] = parts;
  const createdAt = new Date(createdAtRaw!);
  if (!id || Number.isNaN(createdAt.getTime())) {
    throw new InvalidPaymentCursorError();
  }

  return { createdAt, id };
}

function toCursor(row: AdminPaymentListRow): string {
  return `${row.createdAt.toISOString()}~${row.id}`;
}

function toItem(row: AdminPaymentListRow): AdminPaymentListItem {
  return {
    id: row.id,
    userId: row.userId,
    userName: row.userName,
    userEmail: row.userEmail,
    amountIdr: row.amountIdr,
    marks: row.marks,
    status: row.status as AdminPaymentStatus,
    provider: row.provider,
    providerReference: row.providerReference,
    purchaseLabel: row.purchaseLabel,
    createdAt: row.createdAt.toISOString(),
    providerSuccessAt: row.providerSuccessAt?.toISOString() ?? null,
    providerRefundKind: row.providerRefundKind as AdminPaymentRefundKind | null,
    providerRefundAmountIdr: row.providerRefundAmountIdr,
  };
}

function parseDateFilter(value: string | undefined, field: string) {
  if (!value) return undefined;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new InvalidPaymentFilterError(
      `${field} must be a valid ISO datetime`,
    );
  }
  return parsed;
}

export type AdminPaymentService = ReturnType<typeof createAdminPaymentService>;

export function createAdminPaymentService(deps: {
  db: DbType;
  repo: AdminPaymentRepo;
}) {
  const { db, repo } = deps;

  async function list(
    input: AdminListPaymentsInput = {},
  ): Promise<AdminListPaymentsResult> {
    const limit = input.limit ?? DEFAULT_LIMIT;
    const dateFrom = parseDateFilter(input.dateFrom, "dateFrom");
    const dateTo = parseDateFilter(input.dateTo, "dateTo");

    if (dateFrom && dateTo && dateFrom.getTime() > dateTo.getTime()) {
      throw new InvalidPaymentFilterError("dateFrom must not be after dateTo");
    }

    const filters = {
      status: input.status,
      userId: input.userId,
      query: input.query,
      dateFrom,
      dateTo,
    };
    const cursor = input.cursor ? parsePaymentCursor(input.cursor) : undefined;

    const [rows, total] = await Promise.all([
      repo.listRows(db, filters, limit, cursor),
      repo.countRows(db, filters),
    ]);

    const hasNextPage = rows.length > limit;
    const items = hasNextPage ? rows.slice(0, limit) : rows;
    const lastItem = items[items.length - 1];

    return {
      items: items.map(toItem),
      nextCursor: hasNextPage && lastItem ? toCursor(lastItem) : null,
      total,
    };
  }

  return { list };
}
