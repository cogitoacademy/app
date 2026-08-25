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
} from "./achievement.repo";
import type {
  AchievementAuditPort,
  AchievementNotificationPort,
} from "./index";

type AchievementRow = typeof achievement.$inferSelect;

export interface UpdateAchievementInput {
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

export function validateDelete(existing: AchievementRow | undefined): void {
  if (!existing || existing.status !== ACHIEVEMENT_STATUS.PENDING) {
    throw new AchievementNotEditableError(existing?.id ?? "unknown");
  }
}

export function createAchievementService(deps: {
  achievementRepo: AchievementRepo;
  auditPort: AchievementAuditPort;
  notificationPort: AchievementNotificationPort;
  db: DbType;
}) {
  const { achievementRepo, auditPort, notificationPort, db } = deps;

  async function list(userId: string) {
    return achievementRepo.listByUserId(db, userId);
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

  async function adminReview(adminId: string, input: AdminReviewInput) {
    const existing = await achievementRepo.getById(db, input.achievementId);
    validateReviewTransition(existing, input.status);

    return db.transaction(async (tx) => {
      const updated = await achievementRepo.updateStatus(
        tx,
        input.achievementId,
        input.status,
        input.adminNote,
      );

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
    listApprovedPublic,
    create,
    update,
    remove,
    adminList,
    adminReview,
  };
}

export type AchievementService = ReturnType<typeof createAchievementService>;
