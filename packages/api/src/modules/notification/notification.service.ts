import { eq, and, desc, lt, count } from "drizzle-orm";
import {
  notification,
  notificationDispatch,
  user,
} from "@cogito-app/db/schema";
import type { DbType } from "../../lib/db";
import {
  NOTIFICATION_SEVERITY,
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
} from "../../shared/constants";
import { log } from "../../lib/logger";
import type {
  InAppNotificationPort,
  NotificationWriteParams,
  NotificationListInput,
  NotificationListResult,
  NotificationListItem,
} from "../../shared/ports/notification.port";
import type { EmailPort, EmailMessage } from "../../shared/ports/email.port";

const EMAIL_SUPPORTED_CATEGORIES: Set<string> = new Set([
  "booking",
  "payment",
  "refund",
  "schedule",
  "override",
]);

export type NotificationService = ReturnType<typeof createNotificationService>;

export function createNotificationService(
  db: DbType,
  emailPort?: EmailPort,
): InAppNotificationPort & {
  dispatchStatus: (notificationId: string) => Promise<unknown>;
} {
  async function writeInternal(params: NotificationWriteParams): Promise<void> {
    if (params.eventKey) {
      const [existing] = await params.db
        .select({ id: notification.id })
        .from(notification)
        .where(eq(notification.eventKey, params.eventKey))
        .limit(1);
      if (existing) return;
    }

    const [inserted] = await params.db
      .insert(notification)
      .values({
        userId: params.userId,
        bookingId: params.bookingId ?? null,
        category: params.category,
        title: params.title,
        body: params.body,
        severity: params.severity ?? NOTIFICATION_SEVERITY.INFO,
        eventKey: params.eventKey,
        metadata: params.metadata ?? {},
      })
      .returning();

    if (
      inserted &&
      (params.severity === NOTIFICATION_SEVERITY.ACTION ||
        params.severity === NOTIFICATION_SEVERITY.CRITICAL)
    ) {
      const [userRow] = await params.db
        .select({ email: user.email })
        .from(user)
        .where(eq(user.id, params.userId))
        .limit(1);
      const recipientEmail = userRow?.email ?? "";

      if (emailPort && recipientEmail && EMAIL_SUPPORTED_CATEGORIES.has(params.category)) {
        await params.db.insert(notificationDispatch).values({
          notificationId: inserted.id,
          channel: "email",
          recipientEmail,
          status: "pending",
        });

        await emailPort
          .send({
            to: recipientEmail,
            subject: params.title,
            html: params.body,
            category: params.category as EmailMessage["category"],
          })
          .then(async () => {
            await params.db
              .update(notificationDispatch)
              .set({ status: "sent" })
              .where(eq(notificationDispatch.notificationId, inserted.id));
          })
          .catch(async (error) => {
            await params.db
              .update(notificationDispatch)
              .set({ status: "failed" })
              .where(eq(notificationDispatch.notificationId, inserted.id));
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
    const conditions = [eq(notification.userId, userId)];
    if (opts.unreadOnly) {
      conditions.push(eq(notification.isRead, false));
    }
    if (opts.cursor) {
      conditions.push(lt(notification.createdAt, new Date(opts.cursor)));
    }

    const rows = await db
      .select()
      .from(notification)
      .where(and(...conditions))
      .orderBy(desc(notification.createdAt))
      .limit(limit + 1);

    const items = rows.slice(0, limit) as NotificationListItem[];
    const nextCursor =
      rows.length > limit
        ? items[items.length - 1]!.createdAt.toISOString()
        : null;

    return { items, nextCursor };
  }

  async function getUnreadCount(userId: string): Promise<number> {
    const [row] = await db
      .select({ value: count() })
      .from(notification)
      .where(
        and(eq(notification.userId, userId), eq(notification.isRead, false)),
      );
    return Number(row?.value ?? 0);
  }

  async function markAsRead(userId: string, id: string): Promise<void> {
    await db
      .update(notification)
      .set({ isRead: true, readAt: new Date() })
      .where(and(eq(notification.id, id), eq(notification.userId, userId)));
  }

  async function markAllAsRead(userId: string): Promise<void> {
    await db
      .update(notification)
      .set({ isRead: true, readAt: new Date() })
      .where(
        and(eq(notification.userId, userId), eq(notification.isRead, false)),
      );
  }

  async function dispatchStatus(notificationId: string) {
    const [row] = await db
      .select()
      .from(notificationDispatch)
      .where(eq(notificationDispatch.notificationId, notificationId))
      .limit(1);
    return row ?? null;
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
