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

const DAY_MS = 24 * 60 * 60 * 1000;
export const BOOKING_REPORT_REMINDER_BATCH_SIZE = 100;

export type LegacyBookingReportReminderCandidate = {
  bookingId: string;
  bookingType: "solo" | "group" | "series";
  tutorId: string;
  sessionId: string | null;
  scheduledStartAt: Date;
  scheduledEndAt: Date;
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

export function bookingReportReminderPeriod(endAt: Date, nowAt: Date) {
  const elapsed = nowAt.getTime() - endAt.getTime();
  return Number.isFinite(elapsed) && elapsed >= 0
    ? Math.floor(elapsed / DAY_MS)
    : null;
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
    left.scheduledEndAt.getTime() - right.scheduledEndAt.getTime() ||
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
      const singlePeriod = sql`floor(extract(epoch from (${nowAtIso}::timestamptz - ${booking.scheduledEndAt})) / 86400)::bigint`;
      const singleEventKey = sql`'booking:' || ${booking.id} || ':session:booking:missing-report:day:' || (${singlePeriod})::text`;
      const seriesPeriod = sql`floor(extract(epoch from (${nowAtIso}::timestamptz - ${bookingSession.scheduledEndAt})) / 86400)::bigint`;
      const seriesEventKey = sql`'booking:' || ${booking.id} || ':session:' || ${bookingSession.id} || ':missing-report:day:' || (${seriesPeriod})::text`;
      const afterSingle = after
        ? or(
            gt(booking.scheduledEndAt, after.scheduledEndAt),
            and(
              eq(booking.scheduledEndAt, after.scheduledEndAt),
              gt(booking.id, after.bookingId),
            ),
          )
        : undefined;
      const afterSeries = after
        ? or(
            gt(bookingSession.scheduledEndAt, after.scheduledEndAt),
            and(
              eq(bookingSession.scheduledEndAt, after.scheduledEndAt),
              gt(booking.id, after.bookingId),
            ),
            ...(after.sessionId
              ? [
                  and(
                    eq(bookingSession.scheduledEndAt, after.scheduledEndAt),
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
          .orderBy(asc(booking.scheduledEndAt), asc(booking.id))
          .limit(candidateLimit),
        db
          .select({
            bookingId: booking.id,
            bookingType: booking.type,
            tutorId: booking.tutorId,
            sessionId: bookingSession.id,
            scheduledStartAt: bookingSession.scheduledStartAt,
            scheduledEndAt: bookingSession.scheduledEndAt,
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
            asc(bookingSession.scheduledEndAt),
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
        }))
        .toSorted(reminderOrder)
        .slice(0, candidateLimit);
    },

    async writeIfPending(db, candidate, nowAt, eventKey, write) {
      return db.transaction(async (tx) => {
        const [currentBooking] = await tx
          .select({
            id: booking.id,
            type: booking.type,
            tutorId: booking.tutorId,
            currentState: booking.currentState,
            completedAt: booking.completedAt,
            scheduledStartAt: booking.scheduledStartAt,
            scheduledEndAt: booking.scheduledEndAt,
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
        let scheduledStartAt = currentBooking.scheduledStartAt;
        let scheduledEndAt = currentBooking.scheduledEndAt;

        if (candidate.bookingType === "series") {
          if (!candidate.sessionId) return false;
          const [session] = await tx
            .select({
              id: bookingSession.id,
              currentState: bookingSession.currentState,
              completedAt: bookingSession.completedAt,
              scheduledStartAt: bookingSession.scheduledStartAt,
              scheduledEndAt: bookingSession.scheduledEndAt,
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
          scheduledStartAt = session.scheduledStartAt;
          scheduledEndAt = session.scheduledEndAt;
        } else if (candidate.sessionId !== null) {
          return false;
        }

        const period = bookingReportReminderPeriod(scheduledEndAt, nowAt);
        if (
          scheduledStartAt.getTime() !== candidate.scheduledStartAt.getTime() ||
          scheduledEndAt.getTime() !== candidate.scheduledEndAt.getTime() ||
          scheduledEndAt > nowAt ||
          period === null ||
          eventKey !==
            bookingReportReminderEventKey(
              candidate.bookingId,
              sessionId,
              period,
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
      const period = bookingReportReminderPeriod(
        candidate.scheduledEndAt,
        nowAt,
      );
      if (period === null) {
        skipped += 1;
        continue;
      }

      const eventKey = bookingReportReminderEventKey(
        candidate.bookingId,
        candidate.sessionId,
        period,
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
