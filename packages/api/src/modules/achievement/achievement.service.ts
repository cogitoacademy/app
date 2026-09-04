import type { achievement } from "@cogito-app/db/schema";
import type { DbType } from "../../lib/db";
import { escapeHtml } from "../../lib/sanitize";
import {
  AchievementNotFoundError,
  AchievementNotEditableError,
  OptimisticLockError,
} from "./achievement.errors";
import {
  ACHIEVEMENT_STATUS,
  ACTOR_TYPE,
  NOTIFICATION_CATEGORY,
  NOTIFICATION_SEVERITY,
} from "../../shared/constants";
import type {
  AchievementRepo,
  InsertAchievementParams,
  UpdateAchievementData,
  AdminListInput,
  AchievementListInput,
} from "./achievement.repo";
import type {
  AchievementAuditPort,
  AchievementNotificationPort,
} from "./index";

type AchievementRow = typeof achievement.$inferSelect;
type AchievementStatusCount = { status: string; count: number };

function toAchievementStats(rows: AchievementStatusCount[]) {
  const total = rows.reduce((sum, row) => sum + Number(row.count), 0);
  const countFor = (...statuses: string[]) =>
    rows
      .filter((row) => statuses.includes(row.status))
      .reduce((sum, row) => sum + Number(row.count), 0);

  return {
    total,
    approved: countFor("approved"),
    pending: countFor("pending", "pending_review"),
    rejected: countFor("rejected"),
    archived: countFor("archived"),
  };
}

export interface UpdateAchievementInput {
  id: string;
  version: number;
  data: UpdateAchievementData;
}

export interface AdminUpdateAchievementInput {
  id: string;
  version: number;
  data: UpdateAchievementData;
}

export interface AdminReviewInput {
  achievementId: string;
  status: "approved" | "rejected" | "archived";
  adminNote?: string;
}

/**
 * F12: moderation transition table. `approved`/`rejected` achievements can be
 * archived (hidden from public surfacing); archived ones can be restored to
 * `approved`/`rejected`. Anything else is not an admin review action.
 */
export const ALLOWED_REVIEW_TRANSITIONS: Record<string, string[]> = {
  [ACHIEVEMENT_STATUS.PENDING]: ["approved", "rejected", "archived"],
  [ACHIEVEMENT_STATUS.PENDING_REVIEW]: ["approved", "rejected", "archived"],
  [ACHIEVEMENT_STATUS.APPROVED]: ["archived"],
  [ACHIEVEMENT_STATUS.REJECTED]: ["archived"],
  [ACHIEVEMENT_STATUS.ARCHIVED]: ["approved", "rejected"],
};

export function validateReviewTransition(
  existing: AchievementRow | undefined,
  targetStatus: string,
): void {
  if (!existing) {
    throw new AchievementNotFoundError("unknown");
  }
  const allowed = ALLOWED_REVIEW_TRANSITIONS[existing.status];
  if (!allowed || !allowed.includes(targetStatus)) {
    throw new AchievementNotEditableError(existing.id);
  }
}

export function validateUpdate(existing: AchievementRow | undefined): void {
  if (!existing || existing.status !== ACHIEVEMENT_STATUS.PENDING) {
    throw new AchievementNotEditableError(existing?.id ?? "unknown");
  }
}

export function validateAdminUpdate(
  existing: AchievementRow | undefined,
): void {
  if (
    !existing ||
    (existing.status !== ACHIEVEMENT_STATUS.PENDING &&
      existing.status !== ACHIEVEMENT_STATUS.PENDING_REVIEW)
  ) {
    throw new AchievementNotEditableError(existing?.id ?? "unknown");
  }
}

export function validateDelete(existing: AchievementRow | undefined): void {
  if (!existing || existing.status !== ACHIEVEMENT_STATUS.PENDING) {
    throw new AchievementNotEditableError(existing?.id ?? "unknown");
  }
}

function achievementContent(row: Partial<AchievementRow>) {
  return {
    eventName: row.eventName ?? null,
    category: row.category ?? null,
    award: row.award ?? null,
    level: row.level ?? null,
    issuer: row.issuer ?? null,
    visibility: row.visibility ?? null,
    awardingDate: row.awardingDate ?? null,
    location: row.location ?? null,
    description: row.description ?? null,
    subjects: row.subjects === undefined ? [] : row.subjects,
    evidenceUrl: row.evidenceUrl ?? null,
    documentationUrl: row.documentationUrl ?? null,
  };
}

export function createAchievementService(deps: {
  achievementRepo: AchievementRepo;
  auditPort: AchievementAuditPort;
  notificationPort: AchievementNotificationPort;
  db: DbType;
}) {
  const { achievementRepo, auditPort, notificationPort, db } = deps;

  async function list(userId: string, input?: AchievementListInput) {
    if (input) return achievementRepo.listByUserId(db, userId, input);
    return achievementRepo.listByUserId(db, userId);
  }

  async function stats(userId: string) {
    const rows = await achievementRepo.countByUserId(db, userId);
    return toAchievementStats(rows);
  }

  /**
   * Lists approved + visible achievements for the public landing (F16).
   */
  async function listApprovedPublic() {
    return achievementRepo.listApprovedPublic(db);
  }

  async function create(
    userId: string,
    input: Omit<InsertAchievementParams, "userId">,
  ) {
    const created = await achievementRepo.insert(db, { ...input, userId });
    if (created) {
      await notificationPort.writeBestEffort({
        db,
        userId,
        category: NOTIFICATION_CATEGORY.ACHIEVEMENT,
        severity: NOTIFICATION_SEVERITY.INFO,
        title: "Achievement submitted",
        body: `Your achievement "${escapeHtml(created.eventName)}" was submitted for review.`,
        eventKey: `achievement.${created.id}.submitted`,
      });
    }
    return created;
  }

  async function update(userId: string, input: UpdateAchievementInput) {
    const existing = await achievementRepo.findByIdForUser(
      db,
      input.id,
      userId,
    );
    validateUpdate(existing);
    const rows = await achievementRepo.updateWithVersion(
      db,
      input.id,
      userId,
      input.version,
      input.data,
    );
    if (rows.length === 0)
      throw new OptimisticLockError(input.id, input.version);
    return rows[0];
  }

  /**
   * Lets an admin correct a pending achievement before moderation. The update
   * is versioned and audited, but it deliberately leaves the review status
   * unchanged so approval remains an explicit second action.
   */
  async function adminUpdate(
    adminId: string,
    input: AdminUpdateAchievementInput,
  ) {
    return db.transaction(async (tx) => {
      const existing = await achievementRepo.getById(tx, input.id);
      validateAdminUpdate(existing);

      const [updated] = await achievementRepo.updateByIdWithVersion(
        tx,
        input.id,
        input.version,
        input.data,
      );
      if (!updated) throw new OptimisticLockError(input.id, input.version);

      await auditPort.record({
        db: tx,
        actorId: adminId,
        actorType: ACTOR_TYPE.ADMIN,
        action: "achievement_admin_updated",
        targetId: input.id,
        targetType: "achievement",
        beforeState: achievementContent(existing!),
        afterState: achievementContent(updated),
        details: { previousStatus: existing!.status },
      });

      return updated;
    });
  }

  async function remove(userId: string, id: string, expectedVersion: number) {
    const existing = await achievementRepo.findByIdForUser(db, id, userId);
    validateDelete(existing);
    const rows = await achievementRepo.deleteWithVersion(
      db,
      id,
      userId,
      expectedVersion,
    );
    if (rows.length === 0) throw new OptimisticLockError(id, expectedVersion);
  }

  async function adminList(input?: AdminListInput) {
    const withDefaults: AdminListInput = {
      limit: input?.limit ?? 50,
      offset: input?.offset ?? 0,
      status: input?.status,
    };
    return achievementRepo.adminList(db, withDefaults);
  }

  async function adminStats() {
    const rows = await achievementRepo.countAll(db);
    return toAchievementStats(rows);
  }

  async function adminReview(adminId: string, input: AdminReviewInput) {
    return db.transaction(async (tx) => {
      const existing = await achievementRepo.getById(tx, input.achievementId);
      validateReviewTransition(existing, input.status);

      const updated = await achievementRepo.updateStatus(
        tx,
        input.achievementId,
        input.status,
        input.adminNote,
        existing!.status,
        existing!.version,
      );
      if (!updated) {
        throw new OptimisticLockError(input.achievementId, existing!.version);
      }

      const reviewCopy: Record<string, { title: string; body: string }> = {
        approved: {
          title: "Achievement approved",
          body: `Your achievement "${escapeHtml(existing!.eventName)}" was approved.`,
        },
        rejected: {
          title: "Achievement rejected",
          body: `Your achievement "${escapeHtml(existing!.eventName)}" was rejected.${
            input.adminNote ? ` ${escapeHtml(input.adminNote)}` : ""
          }`,
        },
        archived: {
          title: "Achievement archived",
          body: `Your achievement "${escapeHtml(existing!.eventName)}" was archived by an admin.`,
        },
      };
      const copy = reviewCopy[input.status]!;

      await notificationPort.writeBestEffort({
        db: tx,
        userId: existing!.userId,
        category: NOTIFICATION_CATEGORY.ACHIEVEMENT,
        severity: NOTIFICATION_SEVERITY.INFO,
        title: copy.title,
        body: copy.body,
        eventKey: `achievement.${input.achievementId}.reviewed`,
      });

      await auditPort.record({
        db: tx,
        actorId: adminId,
        actorType: ACTOR_TYPE.ADMIN,
        action: `achievement_${input.status}`,
        targetId: input.achievementId,
        targetType: "achievement",
        details: {
          adminNote: input.adminNote,
          previousStatus: existing!.status,
        },
      });

      return updated;
    });
  }

  return {
    list,
    stats,
    listApprovedPublic,
    create,
    update,
    adminUpdate,
    remove,
    adminList,
    adminStats,
    adminReview,
  };
}

export type AchievementService = ReturnType<typeof createAchievementService>;
