import type { DbOrTx } from "../../lib/tx";
import type { NotificationRepo } from "./notification.repo";
import { NotificationNotFoundError } from "./notification.errors";
import {
  NOTIFICATION_SEVERITY,
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
} from "../../shared/constants";
import { log } from "../../lib/logger";

interface NotificationEmailPort {
  send(message: {
    to: string;
    subject: string;
    html: string;
    category: "booking" | "payment" | "refund" | "schedule" | "override";
  }): Promise<{ messageId: string } | { skipped: true }>;
}

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
  list(
    userId: string,
    opts?: NotificationListInput,
  ): Promise<NotificationListResult>;
  getUnreadCount(userId: string): Promise<number>;
  markAsRead(userId: string, id: string): Promise<void>;
  markAllAsRead(userId: string): Promise<void>;
}

const EMAIL_SUPPORTED_CATEGORIES: Set<string> = new Set([
  "booking",
  "payment",
  "refund",
  "schedule",
  "override",
]);

export type NotificationService = ReturnType<typeof createNotificationService>;

export function createNotificationService(
  repo: NotificationRepo,
  emailPort?: NotificationEmailPort,
): InAppNotificationPort & {
  dispatchStatus: (notificationId: string) => Promise<unknown>;
} {
  async function writeInternal(params: NotificationWriteParams): Promise<void> {
    const conn = params.db;

    if (params.eventKey) {
      const existing = await repo.findNotificationByEventKey(
        conn,
        params.eventKey,
      );
      if (existing) return;
    }

    const inserted = await repo.insertNotification(conn, {
      userId: params.userId,
      bookingId: params.bookingId ?? null,
      category: params.category,
      title: params.title,
      body: params.body,
      severity: params.severity ?? NOTIFICATION_SEVERITY.INFO,
      eventKey: params.eventKey,
      metadata: params.metadata ?? {},
    });

    if (
      inserted &&
      (params.severity === NOTIFICATION_SEVERITY.ACTION ||
        params.severity === NOTIFICATION_SEVERITY.CRITICAL)
    ) {
      const recipientEmail = await repo.findUserEmail(conn, params.userId);

      if (
        emailPort &&
        recipientEmail &&
        EMAIL_SUPPORTED_CATEGORIES.has(params.category)
      ) {
        await repo.insertDispatch(conn, {
          notificationId: inserted.id,
          channel: "email",
          recipientEmail,
          status: "queued",
        });

        await emailPort
          .send({
            to: recipientEmail,
            subject: params.title,
            html: params.body,
            category: params.category as
              | "booking"
              | "payment"
              | "refund"
              | "schedule"
              | "override",
          })
          .then(async () => {
            await repo.updateDispatchStatus(conn, inserted.id, "sent");
          })
          .catch(async (error) => {
            await repo.updateDispatchStatus(conn, inserted.id, "failed");
            log({
              level: "error",
              action: "notification_email_dispatch_failed",
              error: { message: String(error) },
              notificationId: inserted.id,
              userId: params.userId,
            });
          });
      } else if (emailPort && recipientEmail) {
        log({
          level: "debug",
          action: "notification_email_skipped_category",
          category: params.category,
          notificationId: inserted.id,
          userId: params.userId,
        });
      }
    }
  }

  async function write(params: NotificationWriteParams): Promise<void> {
    await writeInternal(params).catch((error) => {
      log({
        level: "error",
        action: "notification_write_failed",
        error: { message: String(error) },
        userId: params.userId,
        category: params.category,
      });
    });
  }

  async function list(
    userId: string,
    opts: NotificationListInput = {},
  ): Promise<NotificationListResult> {
    const limit = Math.min(opts.limit ?? DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT);
    const rows = await repo.listNotifications(userId, {
      unreadOnly: opts.unreadOnly,
      cursor: opts.cursor,
      limit,
    });

    const items = rows.slice(0, limit) as NotificationListItem[];
    const nextCursor =
      rows.length > limit
        ? items[items.length - 1]!.createdAt.toISOString()
        : null;

    return { items, nextCursor };
  }

  async function getUnreadCount(userId: string): Promise<number> {
    return repo.countUnread(userId);
  }

  async function markAsRead(userId: string, id: string): Promise<void> {
    const existing = await repo.findNotificationByIdForUser(id, userId);
    if (!existing) throw new NotificationNotFoundError(id);
    await repo.updateReadStatus(id, userId, true);
  }

  async function markAllAsRead(userId: string): Promise<void> {
    await repo.markAllRead(userId);
  }

  async function dispatchStatus(notificationId: string) {
    return repo.findDispatch(notificationId);
  }

  return {
    write,
    list,
    getUnreadCount,
    markAsRead,
    markAllAsRead,
    dispatchStatus,
  };
}
