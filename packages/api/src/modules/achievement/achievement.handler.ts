import type { DbType } from "../../lib/db";
import { notFound } from "../../lib/errors";
import type { AuditPort } from "../../shared/ports/audit.port";
import type {
  AchievementRepo,
  InsertAchievementParams,
  UpdateAchievementData,
  AdminListInput,
} from "./achievement.repo";
import { validateUpdate, validateDelete } from "./achievement.service";

export interface UpdateAchievementInput {
  id: string;
  data: UpdateAchievementData;
}

export interface AdminReviewInput {
  achievementId: string;
  status: "approved" | "rejected";
  adminNote?: string;
}

export function createAchievementHandler(deps: {
  achievementRepo: AchievementRepo;
  auditPort: AuditPort;
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
    const result = validateUpdate(existing);
    if (!result.ok) throw result.error;
    return achievementRepo.update(db, input.id, userId, input.data);
  }

  async function remove(userId: string, id: string) {
    const existing = await achievementRepo.findByIdForUser(db, id, userId);
    const result = validateDelete(existing);
    if (!result.ok) throw result.error;
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
        actorType: "admin",
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

export type AchievementHandler = ReturnType<typeof createAchievementHandler>;
