import { sql } from "drizzle-orm";
import type { DbOrTx } from "../../lib/tx";
import type { DashboardAnalyticsQuery } from "./admin.repo";

/** Delivery is attributed to the scheduled session day; report submission may be later. */
export async function getOperationsAnalytics(
  conn: DbOrTx,
  query: DashboardAnalyticsQuery,
) {
  const result = await conn.execute(sql`
    WITH private_delivery AS (
      SELECT b.id AS booking_id, NULL::text AS session_id, b.scheduled_start_at AS delivered_at
      FROM booking b WHERE b.type <> 'series' AND b.current_state = 'completed'
      UNION ALL
      SELECT b.id, s.id, s.scheduled_start_at FROM booking_session s
      JOIN booking b ON b.id = s.series_booking_id WHERE s.current_state = 'completed'
    ), private_delivered AS (
      SELECT d.*, COALESCE((SELECT SUM(l.amount) FROM ledger_entry l
        WHERE l.booking_id = d.booking_id AND l.entry_type = 'deduct' AND (
          (d.session_id IS NULL AND (l.event_key = 'booking.' || d.booking_id || '.deduct'
            OR l.event_key LIKE 'booking.' || d.booking_id || '.complete.%'))
          OR (d.session_id IS NOT NULL AND (l.event_key = 'booking.' || d.booking_id || '.session.' || d.session_id || '.deduct'
            OR l.event_key LIKE 'booking.' || d.booking_id || '.session.' || d.session_id || '.deduct.%'))
        )), 0) AS marks
      FROM private_delivery d WHERE d.delivered_at >= ${query.periodStart.toISOString()}::timestamptz AND d.delivered_at <= ${query.periodEnd.toISOString()}::timestamptz
    ), private_future AS (
      SELECT b.id AS booking_id, p.id AS participant_id, p.held_amount,
        CASE WHEN b.price_snapshot->>'engine' = 'v3' AND jsonb_typeof(b.price_snapshot->'perStudentMarks') = 'number'
          AND (b.price_snapshot->>'perStudentMarks') ~ '^[0-9]+$'
          THEN (b.price_snapshot->>'perStudentMarks')::numeric END AS marks
      FROM booking b JOIN booking_participant p ON p.booking_id = b.id
      WHERE b.type <> 'series' AND b.current_state IN ('confirmed', 'scheduled') AND b.scheduled_start_at > ${query.now.toISOString()}::timestamptz
        AND p.role <> 'tutor' AND p.confirmation_state IN ('confirmed', 'reconfirmed')
      UNION ALL
      SELECT b.id, p.id, p.held_amount,
        CASE WHEN s.price_snapshot->>'engine' = 'v3' AND jsonb_typeof(s.price_snapshot->'perStudentMarks') = 'number'
          AND (s.price_snapshot->>'perStudentMarks') ~ '^[0-9]+$'
          THEN (s.price_snapshot->>'perStudentMarks')::numeric END
      FROM booking_session s JOIN booking b ON b.id = s.series_booking_id
      JOIN booking_participant p ON p.booking_id = b.id
      WHERE b.current_state IN ('confirmed', 'scheduled') AND s.current_state = 'scheduled' AND s.scheduled_start_at > ${query.now.toISOString()}::timestamptz
        AND p.role <> 'tutor' AND p.confirmation_state IN ('confirmed', 'reconfirmed')
    ), private_commitment AS (
      SELECT participant_id, COUNT(*) AS seats, COUNT(*) FILTER (WHERE marks IS NULL OR marks <= 0) AS unavailable,
        COALESCE(SUM(marks) FILTER (WHERE marks > 0), 0) AS expected,
        LEAST(MAX(held_amount), COALESCE(SUM(marks) FILTER (WHERE marks > 0), 0)) AS funded
      FROM private_future GROUP BY participant_id
    ), academy_delivered AS (
      SELECT a.id, COALESCE(SUM(l.amount), 0) AS marks
      FROM academy_class_enrollment_allocation a
      JOIN academy_class_session s ON s.id = a.session_id
      JOIN academy_class_session_report r ON r.session_id = s.id AND r.delivery_confirmed
      JOIN ledger_entry l ON l.event_key = 'class-allocation:' || a.id || ':complete:deduct' AND l.entry_type = 'deduct'
      WHERE s.state = 'completed' AND s.start_at >= ${query.periodStart.toISOString()}::timestamptz AND s.start_at <= ${query.periodEnd.toISOString()}::timestamptz
      GROUP BY a.id
    ), academy_future AS (
      SELECT a.*, i.due_at FROM academy_class_enrollment_allocation a
      JOIN academy_class_enrollment e ON e.id = a.enrollment_id AND e.state = 'active'
      JOIN academy_class_enrollment_installment i ON i.id = a.installment_id
      JOIN academy_class_session s ON s.id = a.session_id AND s.state = 'scheduled' AND s.start_at > ${query.now.toISOString()}::timestamptz
      JOIN academy_class c ON c.id = a.class_id AND c.state IN ('published', 'postponed')
      WHERE a.state = 'funded' OR (a.state = 'unfunded_reserved' AND i.state = 'pending' AND i.due_at > ${query.now.toISOString()}::timestamptz)
    ), fee_basis AS (
      SELECT f.gross_honorarium_idr,
        EXISTS (SELECT 1 FROM tutor_payout_allocation a JOIN tutor_payout p ON p.id = a.payout_id
          WHERE a.tutor_session_fee_id = f.id AND a.active AND p.status = 'paid') AS paid
      FROM tutor_session_fee f WHERE f.earned_at >= ${query.periodStart.toISOString()}::timestamptz AND f.earned_at <= ${query.periodEnd.toISOString()}::timestamptz
    )
    SELECT
      (SELECT COALESCE(SUM(marks), 0) FROM private_delivered) AS "privateMarks",
      (SELECT COUNT(*) FROM private_delivered) AS "privateSessions",
      (SELECT COALESCE(SUM(marks), 0) FROM academy_delivered) AS "academyMarks",
      (SELECT COUNT(*) FROM academy_delivered) AS "academySeatSessions",
      (SELECT COALESCE(SUM(funded), 0) FROM private_commitment) AS "privateFundedMarks",
      (SELECT COALESCE(SUM(expected - funded), 0) FROM private_commitment) AS "privateUnfundedMarks",
      (SELECT COALESCE(SUM(seats), 0) FROM private_commitment) AS "privateSeatSessions",
      (SELECT COALESCE(SUM(unavailable), 0) FROM private_commitment) AS "unavailablePrivateRates",
      (SELECT COALESCE(SUM(GREATEST(funded_marks - spent_marks - released_marks, 0)), 0) FROM academy_future WHERE state = 'funded') AS "academyFundedMarks",
      (SELECT COALESCE(SUM(rate_marks), 0) FROM academy_future WHERE state = 'unfunded_reserved') AS "academyUnfundedMarks",
      (SELECT COUNT(*) FROM academy_future) AS "academyUpcomingSeatSessions",
      (SELECT COALESCE(SUM(gross_honorarium_idr), 0) FROM fee_basis) AS "earnedIdr",
      (SELECT COALESCE(SUM(gross_honorarium_idr) FILTER (WHERE paid), 0) FROM fee_basis) AS "paidIdr",
      (SELECT COALESCE(SUM(gross_honorarium_idr) FILTER (WHERE NOT paid), 0) FROM fee_basis) AS "unpaidIdr",
      (SELECT COUNT(*) FROM payment_record WHERE status IN ('PAID', 'SETTLED', 'REFUNDED') AND provider_success_at IS NULL) AS "unavailablePaymentDates"
  `);
  const rows = Array.isArray(result)
    ? result
    : (result as unknown as { rows: Record<string, unknown>[] }).rows;
  if (!rows[0])
    throw new Error("Dashboard operations query returned no aggregate row");
  return rows[0] as Record<string, number | string>;
}
