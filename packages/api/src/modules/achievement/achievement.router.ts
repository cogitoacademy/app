import {
  publicProcedure,
  protectedProcedure,
  studentProcedure,
  adminProcedure,
} from "../../procedures";
import {
  studentAchievementInput,
  updateAchievementInput,
  adminUpdateAchievementInput,
  deleteAchievementInput,
  achievementListInput,
  adminListInput,
  adminReviewInput,
  achievementStatsInput,
} from "./achievement.types";
import type { AchievementHandler } from "./achievement.handler";

export function createAchievementRouter(handler: AchievementHandler) {
  return {
    listApproved: publicProcedure
      .route({
        method: "POST",
        path: "/achievements/listApproved",
        tags: ["Achievements"],
        summary: "List approved public achievements",
        description:
          "Returns approved + visible achievements for the public landing (F16)",
      })
      .handler(handler.listApproved),

    list: protectedProcedure
      .route({
        method: "POST",
        path: "/achievements/list",
        tags: ["Achievements"],
        summary: "List achievements",
        description:
          "Returns a server-paginated page of the authenticated user's achievements",
      })
      .input(achievementListInput)
      .handler(handler.list),

    stats: protectedProcedure
      .route({
        method: "POST",
        path: "/achievements/stats",
        tags: ["Achievements"],
        summary: "Get achievement statistics",
        description:
          "Returns aggregate achievement status counts for the authenticated user",
      })
      .input(achievementStatsInput)
      .handler(handler.stats),

    create: studentProcedure
      .route({
        method: "POST",
        path: "/achievements/create",
        tags: ["Achievements"],
        summary: "Create achievement",
        description: "Submits a new achievement for review",
      })
      .input(studentAchievementInput)
      .handler(handler.create),

    update: studentProcedure
      .route({
        method: "POST",
        path: "/achievements/update",
        tags: ["Achievements"],
        summary: "Update achievement",
        description: "Updates a pending achievement",
      })
      .input(updateAchievementInput)
      .handler(handler.update),

    delete: studentProcedure
      .route({
        method: "POST",
        path: "/achievements/delete",
        tags: ["Achievements"],
        summary: "Delete achievement",
        description: "Deletes a pending achievement",
      })
      .input(deleteAchievementInput)
      .handler(handler.remove),

    adminList: adminProcedure
      .route({
        method: "POST",
        path: "/admin/achievements/list",
        tags: ["Admin", "Achievements"],
        summary: "List all achievements",
        description: "Returns all achievements for admin review, paginated",
      })
      .input(adminListInput)
      .handler(handler.adminList),

    adminStats: adminProcedure
      .route({
        method: "POST",
        path: "/admin/achievements/stats",
        tags: ["Admin", "Achievements"],
        summary: "Get achievement moderation statistics",
        description:
          "Returns aggregate achievement status counts for admin moderation",
      })
      .input(achievementStatsInput)
      .handler(handler.adminStats),

    adminUpdate: adminProcedure
      .route({
        method: "POST",
        path: "/admin/achievements/update",
        tags: ["Admin", "Achievements"],
        summary: "Correct achievement",
        description: "Corrects an achievement submission before it is approved",
      })
      .input(adminUpdateAchievementInput)
      .handler(handler.adminUpdate),

    adminReview: adminProcedure
      .route({
        method: "POST",
        path: "/admin/achievements/review",
        tags: ["Admin", "Achievements"],
        summary: "Review achievement",
        description: "Approves or rejects an achievement with audit trail",
      })
      .input(adminReviewInput)
      .handler(handler.adminReview),
  };
}
