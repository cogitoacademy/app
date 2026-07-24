import { eq, and, desc, lt, count } from "drizzle-orm";
import {
  notification,
  notificationDispatch,
  user,
} from "@cogito-app/db/schema";
import type { DbType } from "../../lib/db";
import type { DbOrTx } from "../../lib/tx";

export type NotificationRepo = ReturnType<typeof createNotificationRepo>;

export async function findNotificationByIdForUser(
  conn: DbOrTx,
  id: string,
  userId: string,
) {
  const [row] = await conn
    .select({ id: notification.id })
    .from(notification)
    .where(and(eq(notification.id, id), eq(notification.userId, userId)))
    .limit(1);
  return row ?? null;
}

export async function findNotificationByEventKey(
  conn: DbOrTx,
  eventKey: string,
) {
  const [row] = await conn
    .select({ id: notification.id })
    .from(notification)
    .where(eq(notification.eventKey, eventKey))
    .limit(1);
  return row ?? null;
}

export async function insertNotification(
  conn: DbOrTx,
  values: {
    userId: string;
    bookingId: string | null;
    category: string;
    title: string;
    body: string;
    severity: string;
    eventKey: string;
    metadata: Record<string, unknown>;
  },
) {
  const [inserted] = await conn
    .insert(notification)
    .values({
      userId: values.userId,
      bookingId: values.bookingId,
      category: values.category,
      title: values.title,
      body: values.body,
      severity: values.severity,
      eventKey: values.eventKey,
      metadata: values.metadata,
    })
    .returning();
  return inserted;
}

export async function findUserEmail(conn: DbOrTx, userId: string) {
  const [row] = await conn
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return row?.email ?? "";
}

export async function insertDispatch(
  conn: DbOrTx,
  values: {
    notificationId: string;
    channel: string;
    recipientEmail: string;
    status: string;
  },
) {
  await conn.insert(notificationDispatch).values({
    notificationId: values.notificationId,
    channel: values.channel,
    recipientEmail: values.recipientEmail,
    status: values.status,
  });
}

export async function updateDispatchStatus(
  conn: DbOrTx,
  notificationId: string,
  status: string,
) {
  await conn
    .update(notificationDispatch)
    .set({ status })
    .where(eq(notificationDispatch.notificationId, notificationId));
}

export async function listNotifications(
  conn: DbOrTx,
  userId: string,
  opts: { unreadOnly?: boolean; cursor?: string; limit: number },
) {
  const conditions = [eq(notification.userId, userId)];
  if (opts.unreadOnly) {
    conditions.push(eq(notification.isRead, false));
  }
  if (opts.cursor) {
    conditions.push(lt(notification.createdAt, new Date(opts.cursor)));
  }

  const rows = await conn
    .select()
    .from(notification)
    .where(and(...conditions))
    .orderBy(desc(notification.createdAt))
    .limit(opts.limit + 1);

  return rows;
}

export async function countUnread(conn: DbOrTx, userId: string) {
  const [row] = await conn
    .select({ value: count() })
    .from(notification)
    .where(
      and(eq(notification.userId, userId), eq(notification.isRead, false)),
    );
  return Number(row?.value ?? 0);
}

export async function updateReadStatus(
  conn: DbOrTx,
  id: string,
  userId: string,
  read: boolean,
) {
  await conn
    .update(notification)
    .set({ isRead: read, readAt: read ? new Date() : null })
    .where(and(eq(notification.id, id), eq(notification.userId, userId)));
}

export async function markAllRead(conn: DbOrTx, userId: string) {
  await conn
    .update(notification)
    .set({ isRead: true, readAt: new Date() })
    .where(
      and(eq(notification.userId, userId), eq(notification.isRead, false)),
    );
}

export async function findDispatch(conn: DbOrTx, notificationId: string) {
  const [row] = await conn
    .select()
    .from(notificationDispatch)
    .where(eq(notificationDispatch.notificationId, notificationId))
    .limit(1);
  return row ?? null;
}

export function createNotificationRepo(db: DbType) {
  return {
    findNotificationByEventKey,
    findNotificationByIdForUser: (id: string, userId: string) =>
      findNotificationByIdForUser(db, id, userId),
    insertNotification,
    findUserEmail,
    insertDispatch,
    updateDispatchStatus,
    listNotifications: (
      userId: string,
      opts: { unreadOnly?: boolean; cursor?: string; limit: number },
    ) => listNotifications(db, userId, opts),
    countUnread: (userId: string) => countUnread(db, userId),
    updateReadStatus: (id: string, userId: string, read: boolean) =>
      updateReadStatus(db, id, userId, read),
    markAllRead: (userId: string) => markAllRead(db, userId),
    findDispatch: (notificationId: string) => findDispatch(db, notificationId),
  };
}
