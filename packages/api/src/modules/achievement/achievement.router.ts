import { protectedProcedure, adminProcedure } from "../../procedures";
import {
  achievementInput,
  updateAchievementInput,
  deleteAchievementInput,
  adminListInput,
  adminReviewInput,
} from "./achievement.types";

export const achievementRouter = {
  list: protectedProcedure
    .route({
      method: "POST",
      path: "/achievements/list",
      tags: ["Achievements"],
      summary: "List achievements",
      description: "Returns the authenticated user's achievements",
    })
    .handler(async ({ context }) => {
      return context.services.achievement.list(context.session.user.id);
    }),

  create: protectedProcedure
    .route({
      method: "POST",
      path: "/achievements/create",
      tags: ["Achievements"],
      summary: "Create achievement",
      description: "Submits a new achievement for review",
    })
    .input(achievementInput)
    .handler(async ({ context, input }) => {
      return context.services.achievement.create(
        context.session.user.id,
        input,
      );
    }),

  update: protectedProcedure
    .route({
      method: "POST",
      path: "/achievements/update",
      tags: ["Achievements"],
      summary: "Update achievement",
      description: "Updates a pending achievement",
    })
    .input(updateAchievementInput)
    .handler(async ({ context, input }) => {
      return context.services.achievement.update(
        context.session.user.id,
        input,
      );
    }),

  delete: protectedProcedure
    .route({
      method: "POST",
      path: "/achievements/delete",
      tags: ["Achievements"],
      summary: "Delete achievement",
      description: "Deletes a pending achievement",
    })
    .input(deleteAchievementInput)
    .handler(async ({ context, input }) => {
      return context.services.achievement.remove(
        context.session.user.id,
        input.id,
      );
    }),

  adminList: adminProcedure
    .route({
      method: "POST",
      path: "/admin/achievements/list",
      tags: ["Admin", "Achievements"],
      summary: "List all achievements",
      description: "Returns all achievements for admin review, paginated",
    })
    .input(adminListInput)
    .handler(async ({ context, input }) => {
      return context.services.achievement.adminList(input ?? {});
    }),

  adminReview: adminProcedure
    .route({
      method: "POST",
      path: "/admin/achievements/review",
      tags: ["Admin", "Achievements"],
      summary: "Review achievement",
      description: "Approves or rejects an achievement with audit trail",
    })
    .input(adminReviewInput)
    .handler(async ({ context, input }) => {
      return context.services.achievement.adminReview(
        context.session.user.id,
        input,
      );
    }),
};
