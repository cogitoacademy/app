import type { DbType } from "../../lib/db";
import type {
  AdminAuditRepo,
  AuditLogCursor,
  AuditLogListRow,
} from "./admin-audit.repo";
import {
  InvalidAuditCursorError,
  InvalidAuditDateRangeError,
} from "./admin-audit.errors";
import type { ListAuditLogsInput } from "./admin-audit.types";

const CURSOR_SEPARATOR = "~";

export type AuditLogView = {
  id: string;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  actorType: string;
  action: string;
  targetType: string;
  targetId: string | null;
  beforeState: unknown;
  afterState: unknown;
  details: Record<string, unknown> | null;
  createdAt: string;
};

export type AuditLogPage = {
  items: AuditLogView[];
  nextCursor: string | null;
};

function normalizeFilter(value?: string): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function encodeCursor(row: AuditLogListRow): string {
  return `${row.createdAt.toISOString()}${CURSOR_SEPARATOR}${row.id}`;
}

function decodeCursor(value: string): AuditLogCursor {
  const separatorIndex = value.indexOf(CURSOR_SEPARATOR);
  if (separatorIndex <= 0) throw new InvalidAuditCursorError();

  const createdAt = new Date(value.slice(0, separatorIndex));
  const id = value.slice(separatorIndex + 1).trim();
  if (Number.isNaN(createdAt.getTime()) || !id) {
    throw new InvalidAuditCursorError();
  }

  return { createdAt, id };
}

function parseDate(value?: string): Date | null {
  return value ? new Date(value) : null;
}

function toView(row: AuditLogListRow): AuditLogView {
  return {
    id: row.id,
    actorId: row.actorId,
    actorName: row.actorName,
    actorEmail: row.actorEmail,
    actorType: row.actorType,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    beforeState: row.beforeState,
    afterState: row.afterState,
    details: row.details,
    createdAt: row.createdAt.toISOString(),
  };
}

export type AdminAuditService = ReturnType<typeof createAdminAuditService>;

export function createAdminAuditService(deps: {
  db: DbType;
  repo: AdminAuditRepo;
}) {
  const { db, repo } = deps;

  async function list(input: ListAuditLogsInput): Promise<AuditLogPage> {
    const dateFrom = parseDate(input.dateFrom);
    const dateTo = parseDate(input.dateTo);

    if (dateFrom && dateTo && dateFrom.getTime() > dateTo.getTime()) {
      throw new InvalidAuditDateRangeError();
    }

    const rows = await repo.listPage(db, {
      limit: input.limit,
      cursor: input.cursor ? decodeCursor(input.cursor) : null,
      action: normalizeFilter(input.action),
      targetType: normalizeFilter(input.targetType),
      targetId: normalizeFilter(input.targetId),
      actorId: normalizeFilter(input.actorId),
      dateFrom,
      dateTo,
    });

    const hasMore = rows.length > input.limit;
    const pageRows = hasMore ? rows.slice(0, input.limit) : rows;
    const lastRow = pageRows.at(-1);

    return {
      items: pageRows.map(toView),
      nextCursor: hasMore && lastRow ? encodeCursor(lastRow) : null,
    };
  }

  return { list };
}
