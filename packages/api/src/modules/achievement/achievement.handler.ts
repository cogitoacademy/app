import type { Context } from "../../context";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { internalServerError } from "../../lib/errors";
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
    try {
      return achievementService.list(context.session!.user.id);
    } catch (err) {
      if (err instanceof ORPCError) throw err;
      throw internalServerError("Failed to list achievements", err);
    }
  }

  async function create({
    context,
    input,
  }: {
    context: Context;
    input: AchievementInput;
  }) {
    try {
      return achievementService.create(context.session!.user.id, input);
    } catch (err) {
      if (err instanceof ORPCError) throw err;
      throw internalServerError("Failed to create achievement", err);
    }
  }

  async function update({
    context,
    input,
  }: {
    context: Context;
    input: UpdateAchievementInput;
  }) {
    try {
      return achievementService.update(context.session!.user.id, input);
    } catch (err) {
      if (err instanceof ORPCError) throw err;
      throw internalServerError("Failed to update achievement", err);
    }
  }

  async function remove({
    context,
    input,
  }: {
    context: Context;
    input: DeleteAchievementInput;
  }) {
    try {
      return achievementService.remove(context.session!.user.id, input.id);
    } catch (err) {
      if (err instanceof ORPCError) throw err;
      throw internalServerError("Failed to delete achievement", err);
    }
  }

  async function adminList({
    input,
  }: {
    context: Context;
    input: AdminListInput;
  }) {
    try {
      return achievementService.adminList(input ?? {});
    } catch (err) {
      if (err instanceof ORPCError) throw err;
      throw internalServerError("Failed to list achievements (admin)", err);
    }
  }

  async function adminReview({
    context,
    input,
  }: {
    context: Context;
    input: AdminReviewInput;
  }) {
    try {
      return achievementService.adminReview(context.session!.user.id, input);
    } catch (err) {
      if (err instanceof ORPCError) throw err;
      throw internalServerError("Failed to review achievement", err);
    }
  }

  return { list, create, update, remove, adminList, adminReview };
}

export type AchievementHandler = ReturnType<typeof createAchievementHandler>;
