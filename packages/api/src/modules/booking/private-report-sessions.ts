import { and, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import {
  booking,
  bookingSession,
  sessionCompletionFeedback,
} from "@cogito-app/db/schema";
import type { DbType } from "../../lib/db";
import { BookingNotOwnedError } from "./booking.errors";

export async function listPrivateReportSessions(
  db: DbType,
  actorId: string,
  role: string,
  now = new Date(),
) {
  if (role !== "admin" && role !== "tutor")
    throw new BookingNotOwnedError("session-reports", actorId);
  const scope = role === "tutor" ? eq(booking.tutorId, actorId) : undefined;
  const common = {
    bookingId: booking.id,
    bookingNumber: booking.bookingNumber,
    bookingType: booking.type,
    parentState: booking.currentState,
    learningGoal: booking.learningGoal,
    sessionTopic: booking.sessionTopic,
    modality: booking.modality,
    reportId: sessionCompletionFeedback.id,
    reportVersion: sessionCompletionFeedback.version,
  };
  const [single, series] = await Promise.all([
    db
      .select({
        ...common,
        sessionId: sql<string | null>`null`,
        sessionPosition: sql<number | null>`null`,
        startAt: booking.scheduledStartAt,
        endAt: booking.scheduledEndAt,
        state: booking.currentState,
      })
      .from(booking)
      .leftJoin(
        sessionCompletionFeedback,
        and(
          eq(sessionCompletionFeedback.bookingId, booking.id),
          isNull(sessionCompletionFeedback.sessionId),
        ),
      )
      .where(
        and(
          scope,
          inArray(booking.type, ["solo", "group"]),
          lte(booking.scheduledEndAt, now),
          role === "admin"
            ? inArray(booking.currentState, [
                "scheduled",
                "completed",
                "no_show",
              ])
            : inArray(booking.currentState, ["scheduled", "completed"]),
        ),
      ),
    db
      .select({
        ...common,
        sessionId: bookingSession.id,
        sessionPosition: sql<number>`(select count(*)::int from booking_session s where s.series_booking_id = ${booking.id} and (s.scheduled_start_at, s.id) <= (${bookingSession.scheduledStartAt}, ${bookingSession.id}))`,
        startAt: bookingSession.scheduledStartAt,
        endAt: bookingSession.scheduledEndAt,
        state: bookingSession.currentState,
      })
      .from(bookingSession)
      .innerJoin(booking, eq(bookingSession.seriesBookingId, booking.id))
      .leftJoin(
        sessionCompletionFeedback,
        and(
          eq(sessionCompletionFeedback.bookingId, booking.id),
          eq(sessionCompletionFeedback.sessionId, bookingSession.id),
        ),
      )
      .where(
        and(
          scope,
          eq(booking.type, "series"),
          lte(bookingSession.scheduledEndAt, now),
          inArray(bookingSession.currentState, ["scheduled", "completed"]),
        ),
      ),
  ]);
  return [...single, ...series]
    .filter((row) => row.state !== "no_show" || row.bookingType === "solo")
    .map((row) => ({
      id: `private:${row.sessionId ?? row.bookingId}`,
      bookingId: row.bookingId,
      sessionId: row.sessionId,
      reference: `BKG-${row.bookingNumber}${row.sessionPosition ? `-S${row.sessionPosition}` : ""}`,
      title:
        row.sessionTopic?.subcategoryName ||
        row.learningGoal ||
        "Private session",
      bookingType: row.bookingType,
      startAt: row.startAt,
      endAt: row.endAt,
      mode: row.modality === "online" ? "online" : "in_person",
      reportId: row.reportId,
      reportVersion: row.reportVersion,
      canRecord:
        !row.reportId &&
        ((row.state === "scheduled" && row.parentState === "scheduled") ||
          (role === "admin" &&
            (row.state === "completed" ||
              (row.state === "no_show" && row.bookingType === "solo")))),
      canEdit: Boolean(
        role === "admin" && row.reportId && row.state === "completed",
      ),
    }))
    .toSorted(
      (left, right) =>
        right.startAt.getTime() - left.startAt.getTime() ||
        left.id.localeCompare(right.id),
    );
}
