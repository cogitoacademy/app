import type { achievement } from "@cogito-app/db/schema";
import type { DbType } from "../../lib/db";
import { badRequest, notFound } from "../../lib/errors";
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
  data: UpdateAchievementData;
}

export interface AdminReviewInput {
  achievementId: string;
  status: "approved" | "rejected";
  adminNote?: string;
}

export function validateUpdate(existing: AchievementRow | undefined): void {
  if (!existing || existing.status !== ACHIEVEMENT_STATUS.PENDING) {
    throw badRequest("Can only edit pending achievements");
  }
}

export function validateDelete(existing: AchievementRow | undefined): void {
  if (!existing || existing.status !== ACHIEVEMENT_STATUS.PENDING) {
    throw badRequest("Can only delete pending achievements");
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
    return achievementRepo.update(db, input.id, userId, input.data);
  }

  async function remove(userId: string, id: string) {
    const existing = await achievementRepo.findByIdForUser(db, id, userId);
    validateDelete(existing);
    return achievementRepo.deleteRow(db, id, userId);
  }

  async function adminList(input: AdminListInput = {}) {
    return achievementRepo.adminList(db, input);
  }

  async function adminReview(adminId: string, input: AdminReviewInput) {
    const existing = await achievementRepo.getById(db, input.achievementId);
    if (!existing) throw notFound("Achievement not found");

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
