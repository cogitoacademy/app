import type { Context } from "../../context";
import { z } from "zod";
import { withDomainMap } from "../../lib/handler-utils";
import { mapAchievementError } from "./achievement.errors";
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
    return withDomainMap(
      () => achievementService.list(context.session!.user.id),
      mapAchievementError,
    );
  }

  async function listApproved() {
    return withDomainMap(
      () => achievementService.listApprovedPublic(),
      mapAchievementError,
    );
  }

  async function create({
    context,
    input,
  }: {
    context: Context;
    input: AchievementInput;
  }) {
    return withDomainMap(
      () => achievementService.create(context.session!.user.id, input),
      mapAchievementError,
    );
  }

  async function update({
    context,
    input,
  }: {
    context: Context;
    input: UpdateAchievementInput;
  }) {
    return withDomainMap(
      () => achievementService.update(context.session!.user.id, input),
      mapAchievementError,
    );
  }

  async function remove({
    context,
    input,
  }: {
    context: Context;
    input: DeleteAchievementInput;
  }) {
    return withDomainMap(
      () =>
        achievementService.remove(
          context.session!.user.id,
          input.id,
          input.version,
        ),
      mapAchievementError,
    );
  }

  async function adminList({
    input,
  }: {
    context: Context;
    input: AdminListInput;
  }) {
    return withDomainMap(
      () => achievementService.adminList(input),
      mapAchievementError,
    );
  }

  async function adminReview({
    context,
    input,
  }: {
    context: Context;
    input: AdminReviewInput;
  }) {
    return withDomainMap(
      () => achievementService.adminReview(context.session!.user.id, input),
      mapAchievementError,
    );
  }

  return { list, listApproved, create, update, remove, adminList, adminReview };
}

export type AchievementHandler = ReturnType<typeof createAchievementHandler>;
