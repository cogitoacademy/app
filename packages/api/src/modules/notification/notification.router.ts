import { protectedProcedure } from "../../procedures";
import { listInput, idInput } from "./notification.types";
import type { NotificationHandler } from "./notification.handler";

export function createNotificationRouter(handler: NotificationHandler) {
  return {
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
      .handler(handler.list),

    getUnreadCount: protectedProcedure
      .route({
        method: "POST",
        path: "/notification/unread-count",
        tags: ["Notifications"],
        summary: "Unread notification count",
        description: "Returns the number of unread notifications for the user",
      })
      .handler(handler.getUnreadCount),

    markAsRead: protectedProcedure
      .route({
        method: "POST",
        path: "/notification/mark-as-read",
        tags: ["Notifications"],
        summary: "Mark notification as read",
        description: "Marks a single notification as read for the current user",
      })
      .input(idInput)
      .handler(handler.markAsRead),

    markAllAsRead: protectedProcedure
      .route({
        method: "POST",
        path: "/notification/mark-all-as-read",
        tags: ["Notifications"],
        summary: "Mark all notifications as read",
        description:
          "Marks all unread notifications as read for the current user",
      })
      .handler(handler.markAllAsRead),
  };
}
