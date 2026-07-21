import type { Context } from "../../context";
import type { z } from "zod";
import type {
  achievementInput,
  updateAchievementInput,
  deleteAchievementInput,
  adminListInput,
  adminReviewInput,
} from "./achievement.types";
import type { AchievementService } from "./achievement.service";

type AchievementInput = z.infer<typeof achievementInput>;
type UpdateAchievementInput = z.infer<typeof updateAchievementInput>;
type DeleteAchievementInput = z.infer<typeof deleteAchievementInput>;
type AdminListInput = z.infer<typeof adminListInput>;
type AdminReviewInput = z.infer<typeof adminReviewInput>;

export function createAchievementHandler(deps: {
  achievementService: AchievementService;
}) {
  const { achievementService } = deps;

  async function list({ context }: { context: Context }) {
    return achievementService.list(context.session!.user.id);
  }

  async function create({
    context,
    input,
  }: {
    context: Context;
    input: AchievementInput;
  }) {
    return achievementService.create(context.session!.user.id, input);
  }

  async function update({
    context,
    input,
  }: {
    context: Context;
    input: UpdateAchievementInput;
  }) {
    return achievementService.update(context.session!.user.id, input);
  }

  async function remove({
    context,
    input,
  }: {
    context: Context;
    input: DeleteAchievementInput;
  }) {
    return achievementService.remove(context.session!.user.id, input.id);
  }

  async function adminList({
    input,
  }: {
    context: Context;
    input: AdminListInput;
  }) {
    return achievementService.adminList(input ?? {});
  }

  async function adminReview({
    context,
    input,
  }: {
    context: Context;
    input: AdminReviewInput;
  }) {
    return achievementService.adminReview(context.session!.user.id, input);
  }

  return { list, create, update, remove, adminList, adminReview };
}

export type AchievementHandler = ReturnType<typeof createAchievementHandler>;
