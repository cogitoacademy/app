import type { Context } from "../../context";
import { z } from "zod";
import { withDomainMap } from "../../lib/handler-utils";
import { mapAchievementError } from "./achievement.errors";
import type {
  studentAchievementInput,
  updateAchievementInput,
  adminUpdateAchievementInput,
  deleteAchievementInput,
  achievementListInput,
  adminListInput,
  achievementStatsInput,
  adminReviewInput,
} from "./achievement.types";
import type { AchievementService } from "./achievement.service";

type AchievementInput = z.infer<typeof studentAchievementInput>;
type UpdateAchievementInput = z.infer<typeof updateAchievementInput>;
type AdminUpdateAchievementInput = z.infer<typeof adminUpdateAchievementInput>;
type DeleteAchievementInput = z.infer<typeof deleteAchievementInput>;
type AchievementListInput = z.infer<typeof achievementListInput>;
type AdminListInput = z.infer<typeof adminListInput>;
type AchievementStatsInput = z.infer<typeof achievementStatsInput>;
type AdminReviewInput = z.infer<typeof adminReviewInput>;

export function createAchievementHandler(deps: {
  achievementService: AchievementService;
}) {
  const { achievementService } = deps;

  async function list({
    context,
    input,
  }: {
    context: Context;
    input?: AchievementListInput;
  }) {
    return withDomainMap(
      () =>
        input === undefined
          ? achievementService.list(context.session!.user.id)
          : achievementService.list(context.session!.user.id, input),
      mapAchievementError,
    );
  }

  async function stats({
    context,
  }: {
    context: Context;
    input?: AchievementStatsInput;
  }) {
    return withDomainMap(
      () => achievementService.stats(context.session!.user.id),
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

  async function adminUpdate({
    context,
    input,
  }: {
    context: Context;
    input: AdminUpdateAchievementInput;
  }) {
    return withDomainMap(
      () => achievementService.adminUpdate(context.session!.user.id, input),
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

  async function adminStats({ context: _context }: { context: Context }) {
    return withDomainMap(
      () => achievementService.adminStats(),
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

  return {
    list,
    stats,
    listApproved,
    create,
    update,
    adminUpdate,
    remove,
    adminList,
    adminStats,
    adminReview,
  };
}

export type AchievementHandler = ReturnType<typeof createAchievementHandler>;
