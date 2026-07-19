import { protectedProcedure, adminProcedure } from "../../procedures";
import {
  achievementInput,
  updateAchievementInput,
  deleteAchievementInput,
  adminListInput,
  adminReviewInput,
} from "./achievement.types";
import { achievementHandlers } from "./achievement.handlers";

export const achievementRouter = {
  list: protectedProcedure
    .route({
      method: "POST",
      path: "/achievements/list",
      tags: ["Achievements"],
      summary: "List achievements",
      description: "Returns the authenticated user's achievements",
    })
    .handler(achievementHandlers.list),

  create: protectedProcedure
    .route({
      method: "POST",
      path: "/achievements/create",
      tags: ["Achievements"],
      summary: "Create achievement",
      description: "Submits a new achievement for review",
    })
    .input(achievementInput)
    .handler(achievementHandlers.create),

  update: protectedProcedure
    .route({
      method: "POST",
      path: "/achievements/update",
      tags: ["Achievements"],
      summary: "Update achievement",
      description: "Updates a pending achievement",
    })
    .input(updateAchievementInput)
    .handler(achievementHandlers.update),

  delete: protectedProcedure
    .route({
      method: "POST",
      path: "/achievements/delete",
      tags: ["Achievements"],
      summary: "Delete achievement",
      description: "Deletes a pending achievement",
    })
    .input(deleteAchievementInput)
    .handler(achievementHandlers.delete),

  adminList: adminProcedure
    .route({
      method: "POST",
      path: "/admin/achievements/list",
      tags: ["Admin", "Achievements"],
      summary: "List all achievements",
      description: "Returns all achievements for admin review, paginated",
    })
    .input(adminListInput)
    .handler(achievementHandlers.adminList),

  adminReview: adminProcedure
    .route({
      method: "POST",
      path: "/admin/achievements/review",
      tags: ["Admin", "Achievements"],
      summary: "Review achievement",
      description: "Approves or rejects an achievement with audit trail",
    })
    .input(adminReviewInput)
    .handler(achievementHandlers.adminReview),
};
