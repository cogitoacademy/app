import type { DbOrTx } from "../../lib/tx";

export type NotificationCategory =
  | "booking"
  | "payment"
  | "refund"
  | "schedule"
  | "achievement"
  | "system"
  | "override";

export type NotificationSeverity = "info" | "action" | "critical";

export interface NotificationWriteParams {
  db: DbOrTx;
  userId: string;
  bookingId?: string;
  category: NotificationCategory;
  title: string;
  body: string;
  severity?: NotificationSeverity;
  eventKey: string;
  metadata?: Record<string, unknown>;
}

export interface NotificationListItem {
  id: string;
  userId: string;
  bookingId: string | null;
  category: string;
  title: string;
  body: string;
  severity: string;
  isRead: boolean;
  readAt: Date | null;
  eventKey: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export interface NotificationListInput {
  unreadOnly?: boolean;
  limit?: number;
  cursor?: string;
}

export interface NotificationListResult {
  items: NotificationListItem[];
  nextCursor: string | null;
}

export interface NotificationIdInput {
  id: string;
}

export interface InAppNotificationPort {
  write(params: NotificationWriteParams): Promise<void>;
  list(userId: string, opts?: NotificationListInput): Promise<NotificationListResult>;
  getUnreadCount(userId: string): Promise<number>;
  markAsRead(userId: string, id: string): Promise<void>;
  markAllAsRead(userId: string): Promise<void>;
}