import type { DbOrTx } from "../../lib/tx";
import type { DbType } from "../../lib/db";
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
  /**
   * Opt-in per-event email flag (PRD notification matrix). Defaults to false —
   * only call sites that explicitly require an email dispatch set this true.
   * Email is still gated by severity >= action and the category backstop.
   */
  emailRequired?: boolean;
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
  writeBestEffort(params: NotificationWriteParams): Promise<void>;
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

export interface DispatchResult {
  sent: number;
  failed: number;
}

export type DispatchConsumer = (limit?: number) => Promise<DispatchResult>;

/**
 * Creates the notification service for in-app and outbox-based email notifications.
 *
 * @param repo - the notification repository
 * @param emailPort - optional email sender used by the dispatch consumer
 * @param opts - optional deps; `db` is required by the `dispatchQueuedEmails` consumer
 * @returns an InAppNotificationPort with write/list/read-status methods plus the outbox consumer
 */
export function createNotificationService(
  repo: NotificationRepo,
  emailPort?: NotificationEmailPort,
  opts?: { db?: DbType },
): InAppNotificationPort & { dispatchQueuedEmails: DispatchConsumer } {
  const db = opts?.db;

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
      params.emailRequired === true &&
      (params.severity === NOTIFICATION_SEVERITY.ACTION ||
        params.severity === NOTIFICATION_SEVERITY.CRITICAL)
    ) {
      const recipientEmail = await repo.findUserEmail(conn, params.userId);

      if (recipientEmail && EMAIL_SUPPORTED_CATEGORIES.has(params.category)) {
        await repo.insertDispatch(conn, {
          notificationId: inserted.id,
          channel: "email",
          recipientEmail,
          status: "queued",
        });
      } else if (recipientEmail) {
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

  /**
   * Writes a notification (deduplicated by eventKey), dispatching email for action/critical severity.
   *
   * @param params - the notification write parameters (db, userId, category, title, body, eventKey)
   * @returns a promise resolving when the notification is recorded
   */
  async function write(params: NotificationWriteParams): Promise<void> {
    await writeInternal(params);
  }

  /**
   * Writes a notification best-effort, logging failures without throwing.
   *
   * @param params - the notification write parameters
   * @returns a promise that never rejects
   */
  async function writeBestEffort(
    params: NotificationWriteParams,
  ): Promise<void> {
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

  /**
   * Consumes queued email dispatch rows, sending each via the email port.
   *
   * Runs outside any DB transaction: each queued row is sent best-effort and its
   * status is updated to sent/suppressed on success or failed (with an incremented
   * attempt count) on error.
   *
   * @param limit - the maximum number of queued rows to process in one run
   * @returns a summary of sent and failed dispatches
   */
  async function dispatchQueuedEmails(
    limit = 50,
  ): Promise<{ sent: number; failed: number }> {
    if (!db) {
      log({
        level: "error",
        action: "notification_email_dispatch_no_db",
        message: "dispatchQueuedEmails requires a db connection",
      });
      return { sent: 0, failed: 0 };
    }

    const rows = await repo.listQueuedDispatches(db, limit);
    let sent = 0;
    let failed = 0;

    for (const row of rows) {
      if (!emailPort) {
        failed++;
        continue;
      }
      try {
        const notif = await repo.findNotificationById(db, row.notificationId);
        if (!notif) {
          await repo.updateDispatchStatusById(db, row.id, "suppressed");
          continue;
        }
        const res = await emailPort.send({
          to: row.recipientEmail,
          subject: notif.title,
          html: notif.body,
          category: notif.category as
            | "booking"
            | "payment"
            | "refund"
            | "schedule"
            | "override",
        });
        if ("skipped" in res && res.skipped) {
          await repo.updateDispatchStatusById(db, row.id, "suppressed");
        } else {
          await repo.updateDispatchStatusById(db, row.id, "sent");
          sent++;
        }
      } catch (error) {
        failed++;
        await repo.incrementDispatchAttempts(db, row.id, String(error));
        log({
          level: "error",
          action: "notification_email_dispatch_failed",
          error: { message: String(error) },
          dispatchId: row.id,
        });
      }
    }

    return { sent, failed };
  }

  /**
   * Lists notifications for a user with optional unread filter and cursor pagination.
   *
   * @param userId - the user to list notifications for
   * @param opts - list options (unreadOnly, limit, cursor)
   * @returns the notification items and a nextCursor when more pages exist
   */
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

  /**
   * Counts unread notifications for a user.
   *
   * @param userId - the user to count for
   * @returns the number of unread notifications
   */
  async function getUnreadCount(userId: string): Promise<number> {
    return repo.countUnread(userId);
  }

  /**
   * Marks a single notification as read, verifying ownership.
   *
   * @param userId - the owning user
   * @param id - the notification id
   * @throws {NotificationNotFoundError} if the notification does not exist for the user
   */
  async function markAsRead(userId: string, id: string): Promise<void> {
    const existing = await repo.findNotificationByIdForUser(id, userId);
    if (!existing) throw new NotificationNotFoundError(id);
    await repo.updateReadStatus(id, userId, true);
  }

  /**
   * Marks all of a user's notifications as read.
   *
   * @param userId - the user to update
   */
  async function markAllAsRead(userId: string): Promise<void> {
    await repo.markAllRead(userId);
  }

  return {
    write,
    writeBestEffort,
    list,
    getUnreadCount,
    markAsRead,
    markAllAsRead,
    dispatchQueuedEmails,
  };
}
