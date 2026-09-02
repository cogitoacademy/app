import type { AuditRecordParams } from "../audit/audit.service";
import type { DbType } from "../../lib/db";
import type {
  AdminMarkPackageRepo,
  MarkPackageRow,
} from "./admin-mark-package.repo";
import {
  MarkPackageCodeConflictError,
  MarkPackageNotFoundError,
} from "./admin-mark-package.errors";
import type {
  CreateMarkPackageInput,
  SetMarkPackageActiveInput,
  UpdateMarkPackageInput,
} from "./admin-mark-package.types";

export interface AdminMarkPackageAuditPort {
  record(params: AuditRecordParams): Promise<void>;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

function packageState(row: MarkPackageRow): Record<string, unknown> {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    marks: row.marks,
    priceIdr: row.priceIdr,
    isActive: row.isActive,
  };
}

export type AdminMarkPackageService = ReturnType<
  typeof createAdminMarkPackageService
>;

export function createAdminMarkPackageService(deps: {
  db: DbType;
  repo: AdminMarkPackageRepo;
  auditPort: AdminMarkPackageAuditPort;
}) {
  const { db, repo, auditPort } = deps;

  async function list() {
    return repo.listAll(db);
  }

  async function create(adminId: string, input: CreateMarkPackageInput) {
    return db.transaction(async (tx) => {
      let created: MarkPackageRow;
      try {
        created = await repo.insert(tx, input);
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new MarkPackageCodeConflictError(input.code);
        }
        throw error;
      }

      await auditPort.record({
        db: tx,
        actorId: adminId,
        actorType: "admin",
        action: "mark_package_created",
        targetId: created.id,
        targetType: "mark_package",
        afterState: packageState(created),
      });

      return created;
    });
  }

  async function update(adminId: string, input: UpdateMarkPackageInput) {
    return db.transaction(async (tx) => {
      const before = await repo.getById(tx, input.id);
      if (!before) throw new MarkPackageNotFoundError(input.id);

      const updated = await repo.updateDetails(tx, input.id, {
        name: input.name,
        marks: input.marks,
        priceIdr: input.priceIdr,
      });
      if (!updated) throw new MarkPackageNotFoundError(input.id);

      await auditPort.record({
        db: tx,
        actorId: adminId,
        actorType: "admin",
        action: "mark_package_updated",
        targetId: updated.id,
        targetType: "mark_package",
        beforeState: packageState(before),
        afterState: packageState(updated),
      });

      return updated;
    });
  }

  async function setActive(adminId: string, input: SetMarkPackageActiveInput) {
    return db.transaction(async (tx) => {
      const before = await repo.getById(tx, input.id);
      if (!before) throw new MarkPackageNotFoundError(input.id);
      if (before.isActive === input.isActive) return before;

      const updated = await repo.setActive(tx, input.id, input.isActive);
      if (!updated) throw new MarkPackageNotFoundError(input.id);

      await auditPort.record({
        db: tx,
        actorId: adminId,
        actorType: "admin",
        action: "mark_package_activation_changed",
        targetId: updated.id,
        targetType: "mark_package",
        beforeState: packageState(before),
        afterState: packageState(updated),
      });

      return updated;
    });
  }

  return { list, create, update, setActive };
}
