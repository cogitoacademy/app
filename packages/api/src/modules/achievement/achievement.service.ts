import type { achievement } from "@cogito-app/db/schema";
import type { DbType } from "../../lib/db";
import {
  AchievementNotFoundError,
  AchievementNotEditableError,
  OptimisticLockError,
} from "./achievement.errors";
import { ACHIEVEMENT_STATUS, ACTOR_TYPE } from "../../shared/constants";
import type {
  AchievementRepo,
  InsertAchievementParams,
  UpdateAchievementData,
  AdminListInput,
} from "./achievement.repo";
import type { AchievementAuditPort } from "./index";

type AchievementRow = typeof achievement.$inferSelect;

export interface UpdateAchievementInput {
  id: string;
  version?: number;
  data: UpdateAchievementData;
}

export interface AdminReviewInput {
  achievementId: string;
  status: "approved" | "rejected";
  adminNote?: string;
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
  db: DbType;
}) {
  const { achievementRepo, auditPort, db } = deps;

  async function list(userId: string) {
    return achievementRepo.listByUserId(db, userId);
  }

  async function create(
    userId: string,
    input: Omit<InsertAchievementParams, "userId">,
  ) {
    return achievementRepo.insert(db, { ...input, userId });
  }

  async function update(userId: string, input: UpdateAchievementInput) {
    const existing = await achievementRepo.findByIdForUser(
      db,
      input.id,
      userId,
    );
    validateUpdate(existing);
    if (input.version !== undefined) {
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
    return achievementRepo.update(db, input.id, userId, input.data);
  }

  async function remove(userId: string, id: string, expectedVersion?: number) {
    const existing = await achievementRepo.findByIdForUser(db, id, userId);
    validateDelete(existing);
    if (expectedVersion !== undefined) {
      const rows = await achievementRepo.deleteWithVersion(
        db,
        id,
        userId,
        expectedVersion,
      );
      if (rows.length === 0) throw new OptimisticLockError(id, expectedVersion);
      return;
    }
    await achievementRepo.deleteRow(db, id, userId);
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
    if (!existing) throw new AchievementNotFoundError(input.achievementId);

    return db.transaction(async (tx) => {
      const updated = await achievementRepo.updateStatus(
        tx,
        input.achievementId,
        input.status,
        input.adminNote,
      );

      await auditPort.record({
        db: tx,
        actorId: adminId,
        actorType: ACTOR_TYPE.ADMIN,
        action: `achievement_${input.status}`,
        targetId: input.achievementId,
        targetType: "achievement",
        details: {
          adminNote: input.adminNote,
          previousStatus: existing.status,
        },
      });

      return updated;
    });
  }

  return { list, create, update, remove, adminList, adminReview };
}

export type AchievementService = ReturnType<typeof createAchievementService>;
