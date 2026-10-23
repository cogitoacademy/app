import {
  and,
  asc,
  eq,
  exists,
  gt,
  inArray,
  isNull,
  lte,
  not,
  or,
  sql,
} from "drizzle-orm";
import {
  booking,
  bookingSession,
  notification,
  sessionCompletionFeedback,
} from "@cogito-app/db/schema";
import type { DbType } from "../../lib/db";
import type { TxClient } from "../../lib/tx";
import { log } from "../../lib/logger";
import type { NotificationService } from "../notification/notification.service";

export const BOOKING_REPORT_REMINDER_BATCH_SIZE = 100;

export type LegacyBookingReportReminderCandidate = {
  bookingId: string;
  bookingType: "solo" | "group" | "series";
  tutorId: string;
  sessionId: string | null;
  scheduledStartAt: Date;
  scheduledEndAt: Date;
  scheduledStartAtEpoch: string;
  scheduledEndAtEpoch: string;
  reminderPeriod: number;
  cursorScheduledEndAt: Date;
};

export interface BookingReportReminderRepo {
  findDue(
    db: DbType,
    nowAt: Date,
    limit: number,
    after?: LegacyBookingReportReminderCandidate,
  ): Promise<LegacyBookingReportReminderCandidate[]>;
  writeIfPending(
    db: DbType,
    candidate: LegacyBookingReportReminderCandidate,
    nowAt: Date,
    eventKey: string,
    write: (tx: TxClient) => Promise<void>,
  ): Promise<boolean>;
}

export function bookingReportReminderEventKey(
  bookingId: string,
  sessionId: string | null,
  period: number,
) {
  return `booking:${bookingId}:session:${sessionId ?? "booking"}:missing-report:day:${period}`;
}

function reminderOrder(
  left: LegacyBookingReportReminderCandidate,
  right: LegacyBookingReportReminderCandidate,
) {
  return (
    left.cursorScheduledEndAt.getTime() -
      right.cursorScheduledEndAt.getTime() ||
    left.bookingId.localeCompare(right.bookingId) ||
    (left.sessionId ?? "").localeCompare(right.sessionId ?? "")
  );
}

export function createBookingReportReminderRepo(): BookingReportReminderRepo {
  return {
    async findDue(db, nowAt, limit, after) {
      const candidateLimit = Math.max(
        0,
        Math.min(limit, BOOKING_REPORT_REMINDER_BATCH_SIZE),
      );
      if (!candidateLimit) return [];

      const nowAtIso = nowAt.toISOString();
      const singlePeriod =
        sql<number>`floor(extract(epoch from (${nowAtIso}::timestamptz - ${booking.scheduledEndAt})) / 86400)::bigint`.mapWith(
          Number,
        );
      const singleEventKey = sql`'booking:' || ${booking.id} || ':session:booking:missing-report:day:' || (${singlePeriod})::text`;
      const seriesPeriod =
        sql<number>`floor(extract(epoch from (${nowAtIso}::timestamptz - ${bookingSession.scheduledEndAt})) / 86400)::bigint`.mapWith(
          Number,
        );
      const seriesEventKey = sql`'booking:' || ${booking.id} || ':session:' || ${bookingSession.id} || ':missing-report:day:' || (${seriesPeriod})::text`;
      // Keep exact business timestamps as text; Drizzle's Date decoder truncates microseconds.
      const singleStartEpoch = sql<string>`extract(epoch from ${booking.scheduledStartAt})::text`;
      const singleEndEpoch = sql<string>`extract(epoch from ${booking.scheduledEndAt})::text`;
      const seriesStartEpoch = sql<string>`extract(epoch from ${bookingSession.scheduledStartAt})::text`;
      const seriesEndEpoch = sql<string>`extract(epoch from ${bookingSession.scheduledEndAt})::text`;
      // Match JavaScript cursor precision; raw SQL timestamps also need Drizzle's date decoder.
      const singleCursorEndAt =
        sql`date_trunc('milliseconds', ${booking.scheduledEndAt})`.mapWith(
          booking.scheduledEndAt,
        );
      const seriesCursorEndAt =
        sql`date_trunc('milliseconds', ${bookingSession.scheduledEndAt})`.mapWith(
          bookingSession.scheduledEndAt,
        );
      const afterCursorEndAt = after
        ? sql`${after.cursorScheduledEndAt.toISOString()}::timestamptz`
        : undefined;
      const afterSingle = after
        ? or(
            gt(singleCursorEndAt, afterCursorEndAt),
            and(
              eq(singleCursorEndAt, afterCursorEndAt),
              gt(booking.id, after.bookingId),
            ),
          )
        : undefined;
      const afterSeries = after
        ? or(
            gt(seriesCursorEndAt, afterCursorEndAt),
            and(
              eq(seriesCursorEndAt, afterCursorEndAt),
              gt(booking.id, after.bookingId),
            ),
            ...(after.sessionId
              ? [
                  and(
                    eq(seriesCursorEndAt, afterCursorEndAt),
                    eq(booking.id, after.bookingId),
                    gt(bookingSession.id, after.sessionId),
                  ),
                ]
              : []),
          )
        : undefined;

      const [singleRows, seriesRows] = await Promise.all([
        db
          .select({
            bookingId: booking.id,
            bookingType: booking.type,
            tutorId: booking.tutorId,
            sessionId: sql<string | null>`null`,
            scheduledStartAt: booking.scheduledStartAt,
            scheduledEndAt: booking.scheduledEndAt,
            scheduledStartAtEpoch: singleStartEpoch,
            scheduledEndAtEpoch: singleEndEpoch,
            reminderPeriod: singlePeriod,
            cursorScheduledEndAt: singleCursorEndAt,
          })
          .from(booking)
          .where(
            and(
              inArray(booking.type, ["solo", "group"]),
              eq(booking.currentState, "scheduled"),
              isNull(booking.completedAt),
              lte(booking.scheduledEndAt, nowAt),
              not(
                exists(
                  db
                    .select({ id: sessionCompletionFeedback.id })
                    .from(sessionCompletionFeedback)
                    .where(
                      and(
                        eq(sessionCompletionFeedback.bookingId, booking.id),
                        isNull(sessionCompletionFeedback.sessionId),
                      ),
                    ),
                ),
              ),
              ...(afterSingle ? [afterSingle] : []),
              not(
                exists(
                  db
                    .select({ id: notification.id })
                    .from(notification)
                    .where(eq(notification.eventKey, singleEventKey)),
                ),
              ),
            ),
          )
          .orderBy(asc(singleCursorEndAt), asc(booking.id))
          .limit(candidateLimit),
        db
          .select({
            bookingId: booking.id,
            bookingType: booking.type,
            tutorId: booking.tutorId,
            sessionId: bookingSession.id,
            scheduledStartAt: bookingSession.scheduledStartAt,
            scheduledEndAt: bookingSession.scheduledEndAt,
            scheduledStartAtEpoch: seriesStartEpoch,
            scheduledEndAtEpoch: seriesEndEpoch,
            reminderPeriod: seriesPeriod,
            cursorScheduledEndAt: seriesCursorEndAt,
          })
          .from(booking)
          .innerJoin(
            bookingSession,
            eq(bookingSession.seriesBookingId, booking.id),
          )
          .where(
            and(
              eq(booking.type, "series"),
              eq(booking.currentState, "scheduled"),
              isNull(booking.completedAt),
              eq(bookingSession.currentState, "scheduled"),
              isNull(bookingSession.completedAt),
              lte(bookingSession.scheduledEndAt, nowAt),
              not(
                exists(
                  db
                    .select({ id: sessionCompletionFeedback.id })
                    .from(sessionCompletionFeedback)
                    .where(
                      and(
                        eq(sessionCompletionFeedback.bookingId, booking.id),
                        eq(
                          sessionCompletionFeedback.sessionId,
                          bookingSession.id,
                        ),
                      ),
                    ),
                ),
              ),
              ...(afterSeries ? [afterSeries] : []),
              not(
                exists(
                  db
                    .select({ id: notification.id })
                    .from(notification)
                    .where(eq(notification.eventKey, seriesEventKey)),
                ),
              ),
            ),
          )
          .orderBy(
            asc(seriesCursorEndAt),
            asc(booking.id),
            asc(bookingSession.id),
          )
          .limit(candidateLimit),
      ]);

      return [...singleRows, ...seriesRows]
        .map((row) => ({
          bookingId: row.bookingId,
          bookingType:
            row.bookingType as LegacyBookingReportReminderCandidate["bookingType"],
          tutorId: row.tutorId,
          sessionId: row.sessionId,
          scheduledStartAt: row.scheduledStartAt,
          scheduledEndAt: row.scheduledEndAt,
          scheduledStartAtEpoch: row.scheduledStartAtEpoch,
          scheduledEndAtEpoch: row.scheduledEndAtEpoch,
          reminderPeriod: row.reminderPeriod,
          cursorScheduledEndAt: row.cursorScheduledEndAt,
        }))
        .toSorted(reminderOrder)
        .slice(0, candidateLimit);
    },

    async writeIfPending(db, candidate, nowAt, eventKey, write) {
      return db.transaction(async (tx) => {
        const nowAtIso = nowAt.toISOString();
        const bookingPeriod = sql<
          number | null
        >`case when ${booking.scheduledEndAt} <= ${nowAtIso}::timestamptz then floor(extract(epoch from (${nowAtIso}::timestamptz - ${booking.scheduledEndAt})) / 86400)::bigint else null end`.mapWith(
          (value) => (value === null ? null : Number(value)),
        );
        const sessionPeriod = sql<
          number | null
        >`case when ${bookingSession.scheduledEndAt} <= ${nowAtIso}::timestamptz then floor(extract(epoch from (${nowAtIso}::timestamptz - ${bookingSession.scheduledEndAt})) / 86400)::bigint else null end`.mapWith(
          (value) => (value === null ? null : Number(value)),
        );
        const [currentBooking] = await tx
          .select({
            id: booking.id,
            type: booking.type,
            tutorId: booking.tutorId,
            currentState: booking.currentState,
            completedAt: booking.completedAt,
            scheduledStartAtEpoch: sql<string>`extract(epoch from ${booking.scheduledStartAt})::text`,
            scheduledEndAtEpoch: sql<string>`extract(epoch from ${booking.scheduledEndAt})::text`,
            reminderPeriod: bookingPeriod,
          })
          .from(booking)
          .where(eq(booking.id, candidate.bookingId))
          .for("update");

        if (
          !currentBooking ||
          currentBooking.type !== candidate.bookingType ||
          currentBooking.tutorId !== candidate.tutorId ||
          currentBooking.currentState !== "scheduled" ||
          currentBooking.completedAt !== null
        ) {
          return false;
        }

        let sessionId: string | null = null;
        let scheduledStartAtEpoch = currentBooking.scheduledStartAtEpoch;
        let scheduledEndAtEpoch = currentBooking.scheduledEndAtEpoch;
        let currentPeriod = currentBooking.reminderPeriod;

        if (candidate.bookingType === "series") {
          if (!candidate.sessionId) return false;
          const [session] = await tx
            .select({
              id: bookingSession.id,
              currentState: bookingSession.currentState,
              completedAt: bookingSession.completedAt,
              scheduledStartAtEpoch: sql<string>`extract(epoch from ${bookingSession.scheduledStartAt})::text`,
              scheduledEndAtEpoch: sql<string>`extract(epoch from ${bookingSession.scheduledEndAt})::text`,
              reminderPeriod: sessionPeriod,
            })
            .from(bookingSession)
            .where(
              and(
                eq(bookingSession.id, candidate.sessionId),
                eq(bookingSession.seriesBookingId, candidate.bookingId),
              ),
            )
            .for("update");
          if (
            !session ||
            session.currentState !== "scheduled" ||
            session.completedAt !== null
          ) {
            return false;
          }
          sessionId = session.id;
          scheduledStartAtEpoch = session.scheduledStartAtEpoch;
          scheduledEndAtEpoch = session.scheduledEndAtEpoch;
          currentPeriod = session.reminderPeriod;
        } else if (candidate.sessionId !== null) {
          return false;
        }

        if (
          scheduledStartAtEpoch !== candidate.scheduledStartAtEpoch ||
          scheduledEndAtEpoch !== candidate.scheduledEndAtEpoch ||
          currentPeriod === null ||
          currentPeriod !== candidate.reminderPeriod ||
          eventKey !==
            bookingReportReminderEventKey(
              candidate.bookingId,
              sessionId,
              currentPeriod,
            )
        ) {
          return false;
        }

        const reportConditions = [
          eq(sessionCompletionFeedback.bookingId, candidate.bookingId),
          sessionId
            ? eq(sessionCompletionFeedback.sessionId, sessionId)
            : isNull(sessionCompletionFeedback.sessionId),
        ];
        const [report] = await tx
          .select({ id: sessionCompletionFeedback.id })
          .from(sessionCompletionFeedback)
          .where(and(...reportConditions))
          .limit(1);
        if (report) return false;

        const [existingReminder] = await tx
          .select({ id: notification.id })
          .from(notification)
          .where(eq(notification.eventKey, eventKey))
          .limit(1);
        if (existingReminder) return false;

        await write(tx);
        return true;
      });
    },
  };
}

export function createBookingReportReminderProcessor(deps: {
  db: DbType;
  repo: BookingReportReminderRepo;
  notification: Pick<NotificationService, "write">;
  appBaseUrl: string;
  clock?: () => Date;
}) {
  // This in-process keyset cursor keeps persistent write failures from
  // pinning every scheduler pass to the same oldest batch. It resets on restart.
  let cursor: LegacyBookingReportReminderCandidate | undefined;

  async function processPendingReportReminders() {
    const nowAt = deps.clock?.() ?? new Date();
    let candidates = await deps.repo.findDue(
      deps.db,
      nowAt,
      BOOKING_REPORT_REMINDER_BATCH_SIZE,
      cursor,
    );
    if (candidates.length === 0 && cursor) {
      cursor = undefined;
      candidates = await deps.repo.findDue(
        deps.db,
        nowAt,
        BOOKING_REPORT_REMINDER_BATCH_SIZE,
      );
    }
    const appBaseUrl = deps.appBaseUrl.replace(/\/+$/, "");
    let queued = 0;
    let skipped = 0;
    let failed = 0;

    // Keep lock-and-write transactions sequential within each bounded batch.
    // eslint-disable no-await-in-loop -- Process independently locked candidate rows in sequence.
    for (const candidate of candidates) {
      cursor = candidate;
      if (
        !Number.isSafeInteger(candidate.reminderPeriod) ||
        candidate.reminderPeriod < 0
      ) {
        skipped += 1;
        continue;
      }

      const eventKey = bookingReportReminderEventKey(
        candidate.bookingId,
        candidate.sessionId,
        candidate.reminderPeriod,
      );
      try {
        const wasQueued = await deps.repo.writeIfPending(
          deps.db,
          candidate,
          nowAt,
          eventKey,
          (tx) =>
            deps.notification.write({
              db: tx,
              userId: candidate.tutorId,
              bookingId: candidate.bookingId,
              category: "schedule",
              title: "Session report reminder",
              body: "This ended session has no report on record. Review its outcome, and submit a report only if it was delivered.",
              severity: "action",
              emailRequired: true,
              eventKey,
              metadata: {
                action: "booking-session-report",
                actionUrl: `${appBaseUrl}/bookings/${encodeURIComponent(candidate.bookingId)}`,
              },
            }),
        );
        if (wasQueued) queued += 1;
        else skipped += 1;
      } catch (error) {
        failed += 1;
        log({
          level: "error",
          action: "booking_report_reminder_failed",
          bookingId: candidate.bookingId,
          sessionId: candidate.sessionId,
          eventKey,
          error: { message: String(error) },
        });
      }
    }
    // eslint-enable no-await-in-loop

    return { checked: candidates.length, queued, skipped, failed };
  }

  return { processPendingReportReminders };
}
