import type {
  InsertAchievementParams,
  AdminListInput,
} from "./achievement.repo";
import type {
  AchievementService,
  UpdateAchievementInput,
  AdminReviewInput,
} from "./achievement.service";

export function createAchievementHandler(deps: {
  achievementService: AchievementService;
}) {
  const { achievementService } = deps;

  async function list(userId: string) {
    return achievementService.list(userId);
  }

  async function create(
    userId: string,
    input: Omit<InsertAchievementParams, "userId">,
  ) {
    return achievementService.create(userId, input);
  }

  async function update(userId: string, input: UpdateAchievementInput) {
    return achievementService.update(userId, input);
  }

  async function remove(userId: string, id: string) {
    return achievementService.remove(userId, id);
  }

  async function adminList(input: AdminListInput = {}) {
    return achievementService.adminList(input);
  }

  async function adminReview(adminId: string, input: AdminReviewInput) {
    return achievementService.adminReview(adminId, input);
  }

  return { list, create, update, remove, adminList, adminReview };
}

export type AchievementHandler = ReturnType<typeof createAchievementHandler>;
