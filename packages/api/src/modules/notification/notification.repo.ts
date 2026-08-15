import { eq, and, asc, desc, lt, count, or, sql } from "drizzle-orm";
import {
  notification,
  notificationDispatch,
  user,
} from "@cogito-app/db/schema";
import type { DbType } from "../../lib/db";
import type { DbOrTx } from "../../lib/tx";

export type NotificationRepo = ReturnType<typeof createNotificationRepo>;

/**
 * Finds a notification by id, scoped to the owning user.
 *
 * @param conn - the database connection or active transaction
 * @param id - the notification id
 * @param userId - the owning user
 * @returns a row with the notification id, or null
 */
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

/**
 * Finds a notification by eventKey (for idempotency/deduplication).
 *
 * @param conn - the database connection or active transaction
 * @param eventKey - the event key
 * @returns a row with the notification id, or null
 */
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

/**
 * Inserts a notification row.
 *
 * @param conn - the database connection or active transaction
 * @param values - the notification fields
 * @returns the inserted notification row
 */
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

/**
 * Looks up a user's email address.
 *
 * @param conn - the database connection or active transaction
 * @param userId - the user id
 * @returns the email, or an empty string when not found
 */
export async function findUserEmail(conn: DbOrTx, userId: string) {
  const [row] = await conn
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return row?.email ?? "";
}

/**
 * Inserts a dispatch (email delivery) row for a notification.
 *
 * @param conn - the database connection or active transaction
 * @param values - the dispatch fields
 */
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

/**
 * Updates a dispatch row's status by its own id (used by the outbox consumer).
 *
 * @param conn - the database connection or active transaction
 * @param id - the dispatch row id
 * @param status - the new dispatch status
 */
export async function updateDispatchStatusById(
  conn: DbOrTx,
  id: string,
  status: string,
) {
  await conn
    .update(notificationDispatch)
    .set({ status })
    .where(eq(notificationDispatch.id, id));
}

const MAX_DISPATCH_ATTEMPTS = 3;

/**
 * Lists dispatch rows pending delivery for the email outbox consumer, oldest first.
 *
 * Includes rows that have never been sent (`queued`) and rows that failed a
 * previous attempt but still have retries left (`failed` with attempts < 3),
 * so a transient provider error is retried across scheduler runs instead of
 * losing the email permanently.
 *
 * @param conn - the database connection or active transaction
 * @param limit - the maximum number of rows to return
 * @returns the dispatch rows pending delivery
 */
export async function listPendingDispatches(conn: DbOrTx, limit = 50) {
  return conn
    .select()
    .from(notificationDispatch)
    .where(
      or(
        eq(notificationDispatch.status, "queued"),
        and(
          eq(notificationDispatch.status, "failed"),
          lt(notificationDispatch.attempts, MAX_DISPATCH_ATTEMPTS),
        ),
      ),
    )
    .orderBy(asc(notificationDispatch.createdAt))
    .limit(limit);
}

/**
 * Atomically claims dispatch rows for delivery: moves queued/failed rows to
 * `sending` so a concurrent consumer can never process the same row (M14).
 * Stale `sending` rows (crashed workers) older than 10 minutes are reclaimed.
 *
 * @param conn - the database connection or active transaction
 * @param limit - the maximum number of rows to claim
 * @returns the claimed dispatch rows
 */
export async function claimPendingDispatches(conn: DbOrTx, limit = 50) {
  return conn
    .update(notificationDispatch)
    .set({ status: "sending" })
    .where(
      sql`${notificationDispatch.id} IN (
        SELECT id FROM notification_dispatch
        WHERE status IN ('queued', 'failed') AND attempts < ${MAX_DISPATCH_ATTEMPTS}
           OR (status = 'sending' AND attempts < ${MAX_DISPATCH_ATTEMPTS}
               AND created_at < now() - interval '10 minutes')
        ORDER BY created_at
        LIMIT ${limit}
      )`,
    )
    .returning();
}

/**
 * Increments a dispatch row's attempt counter and records the last error.
 *
 * @param conn - the database connection or active transaction
 * @param id - the dispatch row id
 * @param lastError - the error message from the last failed send, or null
 */
export async function incrementDispatchAttempts(
  conn: DbOrTx,
  id: string,
  lastError?: string | null,
) {
  await conn
    .update(notificationDispatch)
    .set({
      attempts: sql`${notificationDispatch.attempts} + 1`,
      lastError: lastError ?? null,
    })
    .where(eq(notificationDispatch.id, id));
}

/**
 * Finds a notification by id (used by the email outbox consumer).
 *
 * @param conn - the database connection or active transaction
 * @param id - the notification id
 * @returns the full notification row, or null
 */
export async function findNotificationById(conn: DbOrTx, id: string) {
  const [row] = await conn
    .select()
    .from(notification)
    .where(eq(notification.id, id))
    .limit(1);
  return row ?? null;
}

/**
 * Lists a user's notifications with cursor pagination and optional unread filter.
 *
 * @param conn - the database connection or active transaction
 * @param userId - the user id
 * @param opts - list options (unreadOnly, cursor, limit)
 * @returns up to limit+1 rows for nextCursor determination
 */
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
    // Composite (createdAt, id) cursor: equal timestamps cannot skip or
    // duplicate rows across pages (L3). Cursor format: `{iso}|{id}`.
    const [ts, id] = opts.cursor.split("|");
    if (!ts || !id) {
      throw new Error("Invalid notification cursor");
    }
    conditions.push(
      sql`(${notification.createdAt}, ${notification.id}) < (
        SELECT created_at, id FROM notification WHERE id = ${id}
      )`,
    );
  }

  const rows = await conn
    .select()
    .from(notification)
    .where(and(...conditions))
    .orderBy(desc(notification.createdAt))
    .limit(opts.limit + 1);

  return rows;
}

/**
 * Counts a user's unread notifications.
 *
 * @param conn - the database connection or active transaction
 * @param userId - the user id
 * @returns the number of unread notifications
 */
export async function countUnread(conn: DbOrTx, userId: string) {
  const [row] = await conn
    .select({ value: count() })
    .from(notification)
    .where(
      and(eq(notification.userId, userId), eq(notification.isRead, false)),
    );
  return Number(row?.value ?? 0);
}

/**
 * Sets a notification's read status, scoped to the owning user.
 *
 * @param conn - the database connection or active transaction
 * @param id - the notification id
 * @param userId - the owning user
 * @param read - whether the notification is read
 */
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

/**
 * Marks all of a user's notifications as read.
 *
 * @param conn - the database connection or active transaction
 * @param userId - the user id
 */
export async function markAllRead(conn: DbOrTx, userId: string) {
  await conn
    .update(notification)
    .set({ isRead: true, readAt: new Date() })
    .where(
      and(eq(notification.userId, userId), eq(notification.isRead, false)),
    );
}

export function createNotificationRepo(db: DbType) {
  return {
    findNotificationByEventKey,
    findNotificationByIdForUser: (id: string, userId: string) =>
      findNotificationByIdForUser(db, id, userId),
    insertNotification,
    findUserEmail,
    insertDispatch,
    updateDispatchStatusById,
    listPendingDispatches,
    claimPendingDispatches,
    incrementDispatchAttempts,
    findNotificationById,
    listNotifications: (
      userId: string,
      opts: { unreadOnly?: boolean; cursor?: string; limit: number },
    ) => listNotifications(db, userId, opts),
    countUnread: (userId: string) => countUnread(db, userId),
    updateReadStatus: (id: string, userId: string, read: boolean) =>
      updateReadStatus(db, id, userId, read),
    markAllRead: (userId: string) => markAllRead(db, userId),
  };
}
