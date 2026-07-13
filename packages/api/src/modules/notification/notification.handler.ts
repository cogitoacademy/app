import type { NotificationService } from "./notification.service";

export function createNotificationHandler(notification: NotificationService) {
  return {
    write: notification.write.bind(notification),
    list: notification.list.bind(notification),
    getUnreadCount: notification.getUnreadCount.bind(notification),
    markAsRead: notification.markAsRead.bind(notification),
    markAllAsRead: notification.markAllAsRead.bind(notification),
    dispatchStatus: notification.dispatchStatus.bind(notification),
  };
}

export type NotificationHandler = ReturnType<typeof createNotificationHandler>;
