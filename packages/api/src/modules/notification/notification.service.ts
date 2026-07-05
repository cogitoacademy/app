import { eq, and, desc, lt, count } from "drizzle-orm";
import { notification } from "@cogito-app/db/schema";
import type { DbType } from "../../lib/db";
import type {
  InAppNotificationPort,
  NotificationWriteParams,
  NotificationListInput,
  NotificationListResult,
  NotificationListItem,
} from "../../shared/ports/notification.port";

export type NotificationService = ReturnType<typeof createNotificationService>;

export function createNotificationService(db: DbType): InAppNotificationPort {
  async function write(params: NotificationWriteParams): Promise<void> {
    await params.db.insert(notification).values({
      userId: params.userId,
      bookingId: params.bookingId ?? null,
      category: params.category,
      title: params.title,
      body: params.body,
      severity: params.severity ?? "info",
      eventKey: params.eventKey,
      metadata: params.metadata ?? {},
    });
  }

  async function list(
    userId: string,
    opts: NotificationListInput = {},
  ): Promise<NotificationListResult> {
    const limit = Math.min(opts.limit ?? 20, 100);
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
        and(
          eq(notification.userId, userId),
          eq(notification.isRead, false),
        ),
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
        and(
          eq(notification.userId, userId),
          eq(notification.isRead, false),
        ),
      );
  }

  return { write, list, getUnreadCount, markAsRead, markAllAsRead };
}