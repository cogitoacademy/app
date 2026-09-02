import {
  asc,
  and,
  count,
  desc,
  eq,
  gte,
  ilike,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { booking, user } from "@cogito-app/db/schema";
import type { DbOrTx } from "../../lib/tx";
import { USER_ROLE } from "../../shared/constants";

export interface DashboardAnalyticsQuery {
  periodStart: Date;
  periodEnd: Date;
}

export type UserRole = "student" | "tutor" | "admin";
export type UserRow = typeof user.$inferSelect;
export type AdminUserSearchRow = Pick<
  UserRow,
  "id" | "name" | "email" | "image" | "role"
>;

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

/**
 * Lists users with pagination, newest first.
 *
 * @param conn - the database connection or active transaction
 * @param limit - the max number of rows to return
 * @param offset - the number of rows to skip
 * @returns the user rows
 */
export async function listUsers(
  conn: DbOrTx,
  limit: number,
  offset: number,
): Promise<UserRow[]> {
  return conn
    .select()
    .from(user)
    .orderBy(desc(user.createdAt))
    .limit(limit)
    .offset(offset);
}

/**
 * Searches user identities for admin workflows such as wallet lookup.
 *
 * Name, email, and id are searchable because all three are useful support
 * references. The result is deliberately a small identity projection rather
 * than the complete auth row.
 */
export async function searchUsers(
  conn: DbOrTx,
  query: string,
  limit: number,
): Promise<AdminUserSearchRow[]> {
  const normalizedQuery = query.trim();
  const searchPattern = `%${escapeLikePattern(normalizedQuery)}%`;
  const exactMatchRank = sql<number>`case
    when lower(${user.email}) = lower(${normalizedQuery}) then 0
    when lower(${user.id}) = lower(${normalizedQuery}) then 0
    when lower(${user.name}) = lower(${normalizedQuery}) then 1
    else 2
  end`;

  return conn
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      role: user.role,
    })
    .from(user)
    .where(
      or(
        ilike(user.name, searchPattern),
        ilike(user.email, searchPattern),
        ilike(user.id, searchPattern),
      ),
    )
    .orderBy(asc(exactMatchRank), asc(user.name), desc(user.createdAt))
    .limit(limit);
}

/**
 * Counts all users.
 *
 * @param conn - the database connection or active transaction
 * @returns the total user count
 */
export async function countUsers(conn: DbOrTx): Promise<number> {
  const [row] = await conn.select({ count: count() }).from(user);
  return row?.count ?? 0;
}

/**
 * Reads the aggregate rows used by the admin business dashboard.
 *
 * Date-based metrics use booking/user creation time in the requested window.
 * The current booking state mix intentionally has no date filter: it describes
 * the live portfolio an admin has to operate, while the trend rows describe
 * demand and audience movement during the selected period.
 */
export async function getDashboardAnalytics(
  conn: DbOrTx,
  query: DashboardAnalyticsQuery,
) {
  const periodFilter = and(
    gte(booking.createdAt, query.periodStart),
    lte(booking.createdAt, query.periodEnd),
  );
  const userPeriodFilter = and(
    gte(user.createdAt, query.periodStart),
    lte(user.createdAt, query.periodEnd),
  );
  const bookingDay = sql<string>`to_char(${booking.createdAt} AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD')`;
  const userDay = sql<string>`to_char(${user.createdAt} AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD')`;
  const bookingCount = sql<number>`count(*)::int`;
  const completedCount = sql<number>`count(*) FILTER (WHERE ${booking.currentState} = 'completed')::int`;
  const exceptionCount = sql<number>`count(*) FILTER (WHERE ${booking.currentState} IN ('declined', 'cancelled', 'late_cancelled', 'no_show', 'expired'))::int`;
  const grossMarks = sql<number>`coalesce(sum(${booking.originalMarks}), 0)::int`;
  const platformTakeMarks = sql<number>`coalesce(sum(coalesce(nullif(${booking.priceSnapshot}->>'cogitoTake', '')::numeric, 0)), 0)::int`;
  const studentCount = sql<number>`count(*) FILTER (WHERE ${user.role} = 'student')::int`;
  const tutorCount = sql<number>`count(*) FILTER (WHERE ${user.role} = 'tutor')::int`;

  const [
    bookingSummaryRows,
    userSummaryRows,
    bookingTrend,
    userTrend,
    stateBreakdown,
    modalityBreakdown,
    categoryBreakdown,
  ] = await Promise.all([
    conn
      .select({
        bookings: bookingCount,
        completed: completedCount,
        exceptions: exceptionCount,
        activeLearners: sql<number>`count(distinct ${booking.proposerId})::int`,
        grossMarks,
        platformTakeMarks,
      })
      .from(booking)
      .where(periodFilter),
    conn
      .select({
        newStudents: studentCount,
        newTutors: tutorCount,
      })
      .from(user)
      .where(userPeriodFilter),
    conn
      .select({
        date: bookingDay,
        bookings: bookingCount,
        completed: completedCount,
        grossMarks,
        platformTakeMarks,
      })
      .from(booking)
      .where(periodFilter)
      .groupBy(bookingDay)
      .orderBy(asc(bookingDay)),
    conn
      .select({
        date: userDay,
        students: studentCount,
        tutors: tutorCount,
      })
      .from(user)
      .where(userPeriodFilter)
      .groupBy(userDay)
      .orderBy(asc(userDay)),
    conn
      .select({ state: booking.currentState, count: bookingCount })
      .from(booking)
      .groupBy(booking.currentState)
      .orderBy(desc(bookingCount)),
    conn
      .select({ modality: booking.modality, count: bookingCount })
      .from(booking)
      .where(periodFilter)
      .groupBy(booking.modality)
      .orderBy(desc(bookingCount)),
    conn
      .select({
        category: sql<string>`coalesce(nullif(${booking.sessionTopic}->>'categoryName', ''), 'Other')`,
        bookings: bookingCount,
        completed: completedCount,
      })
      .from(booking)
      .where(periodFilter)
      .groupBy(
        sql<string>`coalesce(nullif(${booking.sessionTopic}->>'categoryName', ''), 'Other')`,
      )
      .orderBy(desc(bookingCount))
      .limit(5),
  ]);

  return {
    bookingSummary: bookingSummaryRows[0] ?? {
      bookings: 0,
      completed: 0,
      exceptions: 0,
      activeLearners: 0,
      grossMarks: 0,
      platformTakeMarks: 0,
    },
    userSummary: userSummaryRows[0] ?? { newStudents: 0, newTutors: 0 },
    bookingTrend,
    userTrend,
    stateBreakdown,
    modalityBreakdown,
    categoryBreakdown,
  };
}

/**
 * Fetches a user by id.
 *
 * @param conn - the database connection or active transaction
 * @param userId - the user id
 * @returns the user row, or null
 */
export async function getById(
  conn: DbOrTx,
  userId: string,
): Promise<UserRow | null> {
  const [row] = await conn
    .select()
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  return row ?? null;
}

/**
 * Counts admin-role users.
 *
 * @param conn - the database connection or active transaction
 * @returns the admin user count
 */
export async function countAdmins(conn: DbOrTx): Promise<number> {
  const [row] = await conn
    .select({ count: count() })
    .from(user)
    .where(eq(user.role, USER_ROLE.ADMIN));
  return row?.count ?? 0;
}

/**
 * Locks all admin rows for the remainder of the transaction. Concurrent
 * demotions of the last admins serialize on these rows, so the
 * count-and-check inside a transaction can never observe a stale snapshot.
 *
 * @param conn - the database connection or active transaction
 */
export async function lockAdminRows(conn: DbOrTx): Promise<void> {
  await conn
    .select({ id: user.id })
    .from(user)
    .where(eq(user.role, USER_ROLE.ADMIN))
    .for("update");
}

/**
 * Updates a user's role only when the current role matches expectedRole (optimistic).
 *
 * @param conn - the database connection or active transaction
 * @param userId - the user id
 * @param role - the new role
 * @param expectedRole - the role the user must currently have
 * @returns the updated rows (empty when the expected role did not match)
 */
export async function updateRoleWithExpected(
  conn: DbOrTx,
  userId: string,
  role: UserRole,
  expectedRole: string,
): Promise<UserRow[]> {
  return conn
    .update(user)
    .set({ role })
    .where(and(eq(user.id, userId), eq(user.role, expectedRole)))
    .returning();
}

export function createAdminRepo() {
  return {
    listUsers,
    searchUsers,
    countUsers,
    getDashboardAnalytics,
    getById,
    countAdmins,
    lockAdminRows,
    updateRoleWithExpected,
  };
}

export type AdminRepo = ReturnType<typeof createAdminRepo>;
