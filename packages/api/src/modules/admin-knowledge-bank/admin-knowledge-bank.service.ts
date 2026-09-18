import type { AuditRecordParams } from "../audit/audit.service";
import type {
  AdminKnowledgeBankRepo,
  KnowledgeBankAccessGrantRow,
  KnowledgeBankAccessListRow,
} from "./admin-knowledge-bank.repo";
import {
  InvalidKnowledgeBankAccessExpiryError,
  KnowledgeBankAccessGrantAlreadyExistsError,
  KnowledgeBankAccessGrantNotFoundError,
  StudentNotFoundError,
  TargetUserNotStudentError,
} from "./admin-knowledge-bank.errors";
import type {
  CreateKnowledgeBankAccessInput,
  ListKnowledgeBankAccessInput,
  UpdateKnowledgeBankAccessInput,
} from "./admin-knowledge-bank.types";
import type { DbType } from "../../lib/db";

export interface AdminKnowledgeBankAuditPort {
  record(params: AuditRecordParams): Promise<void>;
}

export interface KnowledgeBankAccessPort {
  getActiveByUserId(
    userId: string,
    now?: Date,
  ): Promise<{ expiresAt: Date } | null>;
}

export type KnowledgeBankAccessView = {
  id: string;
  userId: string;
  studentName: string;
  studentEmail: string;
  expiresAt: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  status: "active" | "expired";
};

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

function normalizeNote(note?: string | null): string | null {
  const value = note?.trim();
  return value ? value : null;
}

function assertFutureExpiry(expiresAt: Date, now = new Date()): void {
  if (
    !(expiresAt instanceof Date) ||
    Number.isNaN(expiresAt.getTime()) ||
    expiresAt.getTime() <= now.getTime()
  ) {
    throw new InvalidKnowledgeBankAccessExpiryError();
  }
}

function grantState(row: KnowledgeBankAccessGrantRow) {
  return {
    id: row.id,
    userId: row.userId,
    grantedByUserId: row.grantedByUserId,
    expiresAt: row.expiresAt.toISOString(),
    note: row.note,
  };
}

function toView(
  row: KnowledgeBankAccessListRow,
  now: Date,
): KnowledgeBankAccessView {
  return {
    id: row.id,
    userId: row.userId,
    studentName: row.studentName,
    studentEmail: row.studentEmail,
    expiresAt: row.expiresAt.toISOString(),
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    status: row.expiresAt.getTime() > now.getTime() ? "active" : "expired",
  };
}

export type AdminKnowledgeBankService = ReturnType<
  typeof createAdminKnowledgeBankService
>;

export function createAdminKnowledgeBankService(deps: {
  db: DbType;
  repo: AdminKnowledgeBankRepo;
  auditPort: AdminKnowledgeBankAuditPort;
}) {
  const { db, repo, auditPort } = deps;

  async function list(input: ListKnowledgeBankAccessInput = { status: "all" }) {
    const now = new Date();
    const rows = await repo.listAll(db, input, now);
    return rows.map((row) => toView(row, now));
  }

  async function getActiveByUserId(userId: string, now = new Date()) {
    return repo.getActiveByUserId(db, userId, now);
  }

  async function create(
    adminId: string,
    input: CreateKnowledgeBankAccessInput,
  ): Promise<KnowledgeBankAccessView> {
    const expiresAt = new Date(input.expiresAt);
    assertFutureExpiry(expiresAt);

    return db.transaction(async (tx) => {
      const target = await repo.findUserByEmail(tx, input.email.trim());
      if (!target) throw new StudentNotFoundError(input.email);
      if (target.role !== "student") {
        throw new TargetUserNotStudentError(input.email);
      }

      const existing = await repo.getByUserId(tx, target.id);
      if (existing) {
        throw new KnowledgeBankAccessGrantAlreadyExistsError(target.id);
      }

      let created: KnowledgeBankAccessGrantRow;
      try {
        created = await repo.insert(tx, {
          userId: target.id,
          grantedByUserId: adminId,
          expiresAt,
          note: normalizeNote(input.note),
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new KnowledgeBankAccessGrantAlreadyExistsError(target.id);
        }
        throw error;
      }

      await auditPort.record({
        db: tx,
        actorId: adminId,
        actorType: "admin",
        action: "knowledge_bank_access_grant_created",
        targetId: created.id,
        targetType: "knowledge_bank_access_grant",
        afterState: grantState(created),
      });

      const view = await repo.getListItemById(tx, created.id);
      if (!view) throw new KnowledgeBankAccessGrantNotFoundError(created.id);
      return toView(view, new Date());
    });
  }

  async function update(
    adminId: string,
    input: UpdateKnowledgeBankAccessInput,
  ): Promise<KnowledgeBankAccessView> {
    const expiresAt = new Date(input.expiresAt);
    assertFutureExpiry(expiresAt);

    return db.transaction(async (tx) => {
      const before = await repo.getById(tx, input.id);
      if (!before) {
        throw new KnowledgeBankAccessGrantNotFoundError(input.id);
      }

      const updated = await repo.updateDetails(tx, input.id, {
        expiresAt,
        note: normalizeNote(input.note),
      });
      if (!updated) {
        throw new KnowledgeBankAccessGrantNotFoundError(input.id);
      }

      await auditPort.record({
        db: tx,
        actorId: adminId,
        actorType: "admin",
        action: "knowledge_bank_access_grant_updated",
        targetId: updated.id,
        targetType: "knowledge_bank_access_grant",
        beforeState: grantState(before),
        afterState: grantState(updated),
      });

      const view = await repo.getListItemById(tx, updated.id);
      if (!view) throw new KnowledgeBankAccessGrantNotFoundError(updated.id);
      return toView(view, new Date());
    });
  }

  async function remove(adminId: string, id: string): Promise<null> {
    return db.transaction(async (tx) => {
      const before = await repo.getById(tx, id);
      if (!before) throw new KnowledgeBankAccessGrantNotFoundError(id);

      const removed = await repo.remove(tx, id);
      if (!removed) throw new KnowledgeBankAccessGrantNotFoundError(id);

      await auditPort.record({
        db: tx,
        actorId: adminId,
        actorType: "admin",
        action: "knowledge_bank_access_grant_removed",
        targetId: id,
        targetType: "knowledge_bank_access_grant",
        beforeState: grantState(before),
      });

      return null;
    });
  }

  return { list, getActiveByUserId, create, update, remove };
}
