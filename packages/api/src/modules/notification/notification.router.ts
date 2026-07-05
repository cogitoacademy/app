import { protectedProcedure } from "../../procedures";
import { listInput, idInput } from "./notification.types";

export const notificationRouter = {
  list: protectedProcedure
    .route({
      method: "POST",
      path: "/notification/list",
      tags: ["Notifications"],
      summary: "List notifications",
      description:
        "Returns the authenticated user's notifications, newest first",
    })
    .input(listInput)
    .handler(async ({ context, input }) => {
      return context.services.notification.list(
        context.session.user.id,
        input ?? {},
      );
    }),

  getUnreadCount: protectedProcedure
    .route({
      method: "POST",
      path: "/notification/unread-count",
      tags: ["Notifications"],
      summary: "Unread notification count",
      description: "Returns the number of unread notifications for the user",
    })
    .handler(async ({ context }) => {
      const c = await context.services.notification.getUnreadCount(
        context.session.user.id,
      );
      return { count: c };
    }),

  markAsRead: protectedProcedure
    .route({
      method: "POST",
      path: "/notification/mark-as-read",
      tags: ["Notifications"],
      summary: "Mark notification as read",
      description: "Marks a single notification as read for the current user",
    })
    .input(idInput)
    .handler(async ({ context, input }) => {
      await context.services.notification.markAsRead(
        context.session.user.id,
        input.id,
      );
      return { ok: true };
    }),

  markAllAsRead: protectedProcedure
    .route({
      method: "POST",
      path: "/notification/mark-all-as-read",
      tags: ["Notifications"],
      summary: "Mark all notifications as read",
      description:
        "Marks all unread notifications as read for the current user",
    })
    .handler(async ({ context }) => {
      await context.services.notification.markAllAsRead(
        context.session.user.id,
      );
      return { ok: true };
    }),
};
