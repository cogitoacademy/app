import { sql } from "drizzle-orm";

import type { DbOrTx } from "./tx";

/**
 * Serializes concurrent booking-creation transactions for the same tutor.
 *
 * Postgres advisory locks are session-scoped unless the `_xact_` variant is
 * used; `pg_advisory_xact_lock` is released automatically at commit/rollback,
 * so holding it across the overlap check + insert is safe and leak-free.
 *
 * `hashtextextended` gives a 64-bit hash (better than the 32-bit `hashtext`).
 *
 * @param conn - the database connection or active transaction
 * @param tutorId - the tutor whose overlap window must not race
 */
export async function lockTutorForBooking(
  conn: DbOrTx,
  tutorId: string,
): Promise<void> {
  await conn.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${tutorId}, 0))`,
  );
}

/** Serializes proposal replacement for a single booking. */
export async function lockBookingReschedule(
  conn: DbOrTx,
  bookingId: string,
): Promise<void> {
  await conn.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${bookingId}, 1))`,
  );
}
