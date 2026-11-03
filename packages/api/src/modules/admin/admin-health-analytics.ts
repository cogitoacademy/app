import { sql } from "drizzle-orm";
import type { DbOrTx } from "../../lib/tx";
import type { DashboardAnalyticsQuery } from "./admin.repo";

export interface FunnelAnalyticsSummary {
  registeredStudents: number;
  bookedStudents: number;
  completedStudents: number;
  paidStudents: number;
}

export interface SupplyDemandAnalyticsRow {
  category: string;
  bookings: number;
  activeTutors: number;
}

export interface SupportSlaSummary {
  openTickets: number;
  breachedTickets: number;
  dueSoonTickets: number;
}

function toCount(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function readRows(result: unknown): Record<string, unknown>[] {
  return Array.isArray(result)
    ? (result as Record<string, unknown>[])
    : (result as { rows: Record<string, unknown>[] }).rows;
}

/**
 * Counts the selected-period student cohort steps in one round trip.
 *
 * Every step is restricted to students whose accounts were created inside the
 * window. Bookings and payments are then counted only for that cohort, so each
 * later step is a subset of the previous one and percentages stay at or below
 * 100. Raw counts only; the dashboard derives step percentages.
 */
export async function getFunnelAnalytics(
  conn: DbOrTx,
  query: DashboardAnalyticsQuery,
): Promise<FunnelAnalyticsSummary> {
  const result = await conn.execute(sql`
    WITH cohort AS (
      SELECT u.id
      FROM "user" u
      WHERE u.role = 'student'
        AND u.created_at >= ${query.periodStart.toISOString()}::timestamptz
        AND u.created_at <= ${query.periodEnd.toISOString()}::timestamptz
    )
    SELECT
      (SELECT COUNT(*)::int FROM cohort) AS "registeredStudents",
      (SELECT COUNT(DISTINCT b.proposer_id)::int FROM booking b
        JOIN cohort c ON c.id = b.proposer_id
        WHERE b.created_at >= ${query.periodStart.toISOString()}::timestamptz
          AND b.created_at <= ${query.periodEnd.toISOString()}::timestamptz
      ) AS "bookedStudents",
      (SELECT COUNT(DISTINCT b.proposer_id)::int FROM booking b
        JOIN cohort c ON c.id = b.proposer_id
        WHERE b.created_at >= ${query.periodStart.toISOString()}::timestamptz
          AND b.created_at <= ${query.periodEnd.toISOString()}::timestamptz
          AND b.current_state = 'completed'
      ) AS "completedStudents",
      (SELECT COUNT(DISTINCT p.user_id)::int FROM payment_record p
        JOIN cohort c ON c.id = p.user_id
        WHERE p.provider_success_at >= ${query.periodStart.toISOString()}::timestamptz
          AND p.provider_success_at <= ${query.periodEnd.toISOString()}::timestamptz
          AND p.status IN ('PAID', 'SETTLED', 'REFUNDED')
      ) AS "paidStudents"
  `);
  const rows = readRows(result);
  const row = rows[0] ?? {};
  return {
    registeredStudents: toCount(row.registeredStudents),
    bookedStudents: toCount(row.bookedStudents),
    completedStudents: toCount(row.completedStudents),
    paidStudents: toCount(row.paidStudents),
  };
}

/**
 * Compares period booking demand with published tutor supply by category.
 *
 * Taxonomy assumption: bookings store the parent category name in
 * `session_topic.categoryName` while tutor selections are child
 * `subject_category` rows. Supply is matched through the child's `parent_id`
 * and a case-insensitive parent-name comparison against the demand label. A
 * category whose name cannot be matched to the catalog returns zero tutors
 * instead of a guessed mapping.
 */
export async function getSupplyDemandAnalytics(
  conn: DbOrTx,
  query: DashboardAnalyticsQuery,
): Promise<SupplyDemandAnalyticsRow[]> {
  const result = await conn.execute(sql`
    WITH demand AS (
      SELECT
        COALESCE(NULLIF(b.session_topic->>'categoryName', ''), 'Other') AS category,
        COUNT(*)::int AS bookings
      FROM booking b
      WHERE b.created_at >= ${query.periodStart.toISOString()}::timestamptz
        AND b.created_at <= ${query.periodEnd.toISOString()}::timestamptz
      GROUP BY COALESCE(NULLIF(b.session_topic->>'categoryName', ''), 'Other')
      ORDER BY bookings DESC, category ASC
      LIMIT 8
    )
    SELECT
      d.category,
      d.bookings,
      COALESCE((
        SELECT COUNT(DISTINCT tp.id)::int
        FROM tutor_profile tp
        JOIN tutor_profile_subject tps ON tps.tutor_profile_id = tp.id
        JOIN subject_category child ON child.id = tps.subject_id
        JOIN subject_category parent ON parent.id = child.parent_id
        WHERE tp.onboarding_status IN ('approved_unpublished', 'published')
          AND lower(parent.name) = lower(d.category)
      ), 0)::int AS "activeTutors"
    FROM demand d
    ORDER BY d.bookings DESC, d.category ASC
  `);

  return readRows(result)
    .filter((row) => typeof row.category === "string")
    .map((row) => ({
      category: row.category as string,
      bookings: toCount(row.bookings),
      activeTutors: toCount(row.activeTutors),
    }));
}

/**
 * Reads the current support-ticket SLA snapshot. This is a live workload
 * measure, not a period metric.
 */
export async function getSupportSlaAnalytics(
  conn: DbOrTx,
  query: DashboardAnalyticsQuery,
): Promise<SupportSlaSummary> {
  const result = await conn.execute(sql`
    SELECT
      COUNT(*)::int AS "openTickets",
      COUNT(*) FILTER (
        WHERE t.sla_deadline < ${query.now.toISOString()}::timestamptz
      )::int AS "breachedTickets",
      COUNT(*) FILTER (
        WHERE t.sla_deadline >= ${query.now.toISOString()}::timestamptz
          AND t.sla_deadline <= ${query.now.toISOString()}::timestamptz + interval '4 hours'
      )::int AS "dueSoonTickets"
    FROM support_ticket t
    WHERE t.status IN ('open', 'in_progress')
  `);
  const rows = readRows(result);
  const row = rows[0] ?? {};
  return {
    openTickets: toCount(row.openTickets),
    breachedTickets: toCount(row.breachedTickets),
    dueSoonTickets: toCount(row.dueSoonTickets),
  };
}
