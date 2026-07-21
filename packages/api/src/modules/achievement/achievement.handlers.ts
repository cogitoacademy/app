import type { Context } from "../../context";
import type { z } from "zod";
import type {
  achievementInput,
  updateAchievementInput,
  deleteAchievementInput,
  adminListInput,
  adminReviewInput,
} from "./achievement.types";

type AchievementInput = z.infer<typeof achievementInput>;
type UpdateAchievementInput = z.infer<typeof updateAchievementInput>;
type DeleteAchievementInput = z.infer<typeof deleteAchievementInput>;
type AdminListInput = z.infer<typeof adminListInput>;
type AdminReviewInput = z.infer<typeof adminReviewInput>;

export const achievementHandlers = {
  list: async ({ context }: { context: Context }) => {
    return context.services.achievement.list(context.session!.user.id);
  },

  create: async ({
    context,
    input,
  }: {
    context: Context;
    input: AchievementInput;
  }) => {
    return context.services.achievement.create(context.session!.user.id, input);
  },

  update: async ({
    context,
    input,
  }: {
    context: Context;
    input: UpdateAchievementInput;
  }) => {
    return context.services.achievement.update(context.session!.user.id, input);
  },

  delete: async ({
    context,
    input,
  }: {
    context: Context;
    input: DeleteAchievementInput;
  }) => {
    return context.services.achievement.remove(
      context.session!.user.id,
      input.id,
    );
  },

  adminList: async ({
    context,
    input,
  }: {
    context: Context;
    input: AdminListInput;
  }) => {
    return context.services.achievement.adminList(input ?? {});
  },

  adminReview: async ({
    context,
    input,
  }: {
    context: Context;
    input: AdminReviewInput;
  }) => {
    return context.services.achievement.adminReview(
      context.session!.user.id,
      input,
    );
  },
};
