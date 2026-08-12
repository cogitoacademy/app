import {
  eq,
  and,
  gte,
  desc,
  inArray,
  notInArray,
  ne,
  lte,
  lt,
  sql,
  getTableColumns,
  notExists,
} from "drizzle-orm";
import {
  booking,
  bookingParticipant,
  bookingStateHistory,
  bookingRescheduleProposal,
  bookingSession,
  availabilitySlot,
  tutorProfile,
  type booking as bookingTable,
} from "@cogito-app/db/schema";
import type { DbType } from "../../lib/db";
import type { DbOrTx } from "../../lib/tx";
import {
  CONFIRMATION_STATE,
  ONBOARDING_STATUS,
  LATENESS_TOLERANCE_MS,
} from "../../shared/constants";

type BookingRow = typeof bookingTable.$inferSelect;

/**
 * Finds a booking by id.
 *
 * @param conn - the database connection or active transaction
 * @param bookingId - the booking id
 * @returns the booking row, or null
 */
async function findBookingById(
  conn: DbOrTx,
  bookingId: string,
): Promise<BookingRow | null> {
  const [b] = await conn
    .select({ ...getTableColumns(booking) })
    .from(booking)
    .where(eq(booking.id, bookingId))
    .limit(1);
  return (b as BookingRow | undefined) ?? null;
}

/**
 * Finds a tutor's profile, optionally restricted to published profiles.
 *
 * @param conn - the database connection or active transaction
 * @param tutorId - the tutor's user id
 * @param opts - options (publishedOnly)
 * @returns the tutor profile, or null
 */
async function findTutorProfile(
  conn: DbOrTx,
  tutorId: string,
  opts?: { publishedOnly?: boolean },
): Promise<typeof tutorProfile.$inferSelect | null> {
  const conditions = [eq(tutorProfile.userId, tutorId)];
  if (opts?.publishedOnly) {
    conditions.push(
      eq(tutorProfile.onboardingStatus, ONBOARDING_STATUS.PUBLISHED),
    );
  }
  return (
    (await conn.query.tutorProfile.findFirst({
      where: and(...conditions),
    })) ?? null
  );
}

/**
 * Finds an active availability slot for a tutor, optionally future-only.
 *
 * @param conn - the database connection or active transaction
 * @param slotId - the slot id
 * @param tutorId - the tutor's user id
 * @param opts - options (futureOnly)
 * @returns the availability slot, or null
 */
async function findAvailabilitySlot(
  conn: DbOrTx,
  slotId: string,
  tutorId: string,
  opts?: { futureOnly?: boolean },
) {
  const conditions = [
    eq(availabilitySlot.id, slotId),
    eq(availabilitySlot.tutorId, tutorId),
    eq(availabilitySlot.isActive, true),
  ];
  if (opts?.futureOnly) {
    conditions.push(gte(availabilitySlot.startDate, new Date()));
  }
  return conn.query.availabilitySlot.findFirst({
    where: and(...conditions),
  });
}

/**
 * Finds a booking participant by booking and user.
 *
 * @param conn - the database connection or active transaction
 * @param bookingId - the booking id
 * @param userId - the participant's user id
 * @returns the participant row, or null
 */
async function findParticipant(
  conn: DbOrTx,
  bookingId: string,
  userId: string,
) {
  const [participant] = await conn
    .select({ ...getTableColumns(bookingParticipant) })
    .from(bookingParticipant)
    .where(
      and(
        eq(bookingParticipant.bookingId, bookingId),
        eq(bookingParticipant.userId, userId),
      ),
    )
    .limit(1);
  return participant ?? null;
}

/**
 * Lists confirmed participants for a booking, optionally excluding one user.
 *
 * @param conn - the database connection or active transaction
 * @param bookingId - the booking id
 * @param excludeUserId - optional user to exclude
 * @returns the confirmed participant rows
 */
async function findConfirmedParticipants(
  conn: DbOrTx,
  bookingId: string,
  excludeUserId?: string,
) {
  const conditions = [
    eq(bookingParticipant.bookingId, bookingId),
    inArray(bookingParticipant.confirmationState, [
      CONFIRMATION_STATE.CONFIRMED,
      CONFIRMATION_STATE.RECONFIRMED,
    ]),
  ];
  if (excludeUserId) {
    conditions.push(ne(bookingParticipant.userId, excludeUserId));
  }
  return conn
    .select({ ...getTableColumns(bookingParticipant) })
    .from(bookingParticipant)
    .where(and(...conditions));
}

/**
 * Lists participants whose confirmation state is RECONFIRMED for a booking.
 *
 * @param conn - the database connection or active transaction
 * @param bookingId - the booking id
 * @returns the reconfirmed participant rows
 */
async function findReconfirmedParticipants(conn: DbOrTx, bookingId: string) {
  return conn
    .select({ ...getTableColumns(bookingParticipant) })
    .from(bookingParticipant)
    .where(
      and(
        eq(bookingParticipant.bookingId, bookingId),
        eq(
          bookingParticipant.confirmationState,
          CONFIRMATION_STATE.RECONFIRMED,
        ),
      ),
    );
}

/**
 * Inserts a booking row.
 *
 * @param conn - the database connection or active transaction
 * @param values - the booking insert values
 * @returns the inserted booking row
 */
async function insertBooking(
  conn: DbOrTx,
  values: typeof booking.$inferInsert,
) {
  const [b] = await conn.insert(booking).values(values).returning();
  return b!;
}

/**
 * Sets a booking's cancellation reason.
 *
 * @param conn - the database connection or active transaction
 * @param bookingId - the booking id
 * @param reason - the cancellation reason (null to clear)
 */
async function updateBookingCancellationReason(
  conn: DbOrTx,
  bookingId: string,
  reason: string | null,
) {
  await conn
    .update(booking)
    .set({ cancellationReason: reason })
    .where(eq(booking.id, bookingId));
}

/**
 * Sets a booking's held Marks amount.
 *
 * @param conn - the database connection or active transaction
 * @param bookingId - the booking id
 * @param holdAmount - the new hold amount
 */
async function updateBookingHoldAmount(
  conn: DbOrTx,
  bookingId: string,
  holdAmount: number,
) {
  await conn
    .update(booking)
    .set({ holdAmount })
    .where(eq(booking.id, bookingId));
}

/**
 * Sets a booking's confirmed headcount.
 *
 * @param conn - the database connection or active transaction
 * @param bookingId - the booking id
 * @param confirmedHeadcount - the new headcount
 */
async function updateBookingConfirmedHeadcount(
  conn: DbOrTx,
  bookingId: string,
  confirmedHeadcount: number,
) {
  await conn
    .update(booking)
    .set({ confirmedHeadcount })
    .where(eq(booking.id, bookingId));
}

/**
 * Inserts a booking participant row.
 *
 * @param conn - the database connection or active transaction
 * @param values - the participant insert values
 */
async function insertParticipant(
  conn: DbOrTx,
  values: typeof bookingParticipant.$inferInsert,
) {
  await conn.insert(bookingParticipant).values(values);
}

/**
 * Updates a participant's state fields.
 *
 * @param conn - the database connection or active transaction
 * @param participantId - the participant id
 * @param values - the fields to update
 */
async function updateParticipantState(
  conn: DbOrTx,
  participantId: string,
  values: Partial<typeof bookingParticipant.$inferInsert>,
) {
  await conn
    .update(bookingParticipant)
    .set(values)
    .where(eq(bookingParticipant.id, participantId));
}

/**
 * Inserts a booking state history entry.
 *
 * @param conn - the database connection or active transaction
 * @param entry - the state history entry details
 */
async function insertStateHistory(
  conn: DbOrTx,
  entry: {
    bookingId: string;
    fromState: string | null;
    toState: string;
    reason?: string | null;
    actorId: string | null;
    actorType: string;
    metadata?: Record<string, unknown>;
  },
) {
  await conn.insert(bookingStateHistory).values({
    bookingId: entry.bookingId,
    fromState: entry.fromState,
    toState: entry.toState,
    reason: entry.reason ?? null,
    actorId: entry.actorId,
    actorType: entry.actorType,
    metadata: entry.metadata ?? {},
  });
}

/**
 * Inserts a reschedule proposal for a booking.
 *
 * @param conn - the database connection or active transaction
 * @param values - the proposal details
 */
async function insertRescheduleProposal(
  conn: DbOrTx,
  values: {
    bookingId: string;
    proposedBy: string;
    proposedStartAt: Date;
    proposedEndAt: Date;
    status: string;
  },
) {
  await conn.insert(bookingRescheduleProposal).values(values);
}

/**
 * Inserts a session for a series booking.
 *
 * @param conn - the database connection or active transaction
 * @param values - the session details including the price snapshot
 */
async function insertBookingSession(
  conn: DbOrTx,
  values: {
    seriesBookingId: string;
    scheduledStartAt: Date;
    scheduledEndAt: Date;
    currentState: string;
    holdAmount: number;
    priceSnapshot: {
      perStudent: number;
      baseline: number;
      tutorShare: number;
      cogitoTake: number;
      baselineCogitoTake: number;
      baselineTutorShare: number;
      extraTotal: number;
      cogitoExtraTake: number;
      tutorExtraShare: number;
    };
  },
) {
  await conn.insert(bookingSession).values(values);
}

/**
 * Lists sessions for a series booking, ordered by start time.
 *
 * @param conn - the database connection or active transaction
 * @param seriesBookingId - the series booking id
 * @returns the session rows
 */
export async function listSessionsBySeriesId(
  conn: DbOrTx,
  seriesBookingId: string,
) {
  return conn
    .select({ ...getTableColumns(bookingSession) })
    .from(bookingSession)
    .where(eq(bookingSession.seriesBookingId, seriesBookingId))
    .orderBy(bookingSession.scheduledStartAt);
}

/**
 * Finds a tutor's overlapping bookings in the given window, optionally excluding one booking or states.
 *
 * @param conn - the database connection or active transaction
 * @param tutorId - the tutor's user id
 * @param startAt - window start
 * @param endAt - window end
 * @param opts - options (excludeBookingId, excludeStates)
 * @returns the first overlapping booking id, or empty
 */
async function findOverlappingBookings(
  conn: DbOrTx,
  tutorId: string,
  startAt: Date,
  endAt: Date,
  opts?: { excludeBookingId?: string; excludeStates?: string[] },
) {
  const conditions = [
    eq(booking.tutorId, tutorId),
    lte(booking.scheduledStartAt, endAt),
    gte(booking.scheduledEndAt, startAt),
  ];
  if (opts?.excludeStates?.length) {
    conditions.push(notInArray(booking.currentState, opts.excludeStates));
  }
  if (opts?.excludeBookingId) {
    conditions.push(ne(booking.id, opts.excludeBookingId));
  }
  return conn
    .select({ id: booking.id })
    .from(booking)
    .where(and(...conditions))
    .limit(1);
}

/**
 * Updates a booking's deadline.
 *
 * @param conn - the database connection or active transaction
 * @param bookingId - the booking id
 * @param deadlineAt - the new deadline
 */
async function updateBookingDeadline(
  conn: DbOrTx,
  bookingId: string,
  deadlineAt: Date,
) {
  await conn
    .update(booking)
    .set({ deadlineAt, updatedAt: new Date() })
    .where(eq(booking.id, bookingId));
}

/**
 * Finds bookings whose deadline has passed and whose state is in the given set (for expiry).
 *
 * @param conn - the database connection or active transaction
 * @param states - states eligible for expiry
 * @returns up to 500 matching booking rows
 */
async function findBookingsExpiringByDeadline(conn: DbOrTx, states: string[]) {
  return conn
    .select({ ...getTableColumns(booking) })
    .from(booking)
    .where(
      and(
        lte(booking.deadlineAt, new Date()),
        inArray(booking.currentState, states),
      ),
    )
    .limit(500);
}

async function findBookingsWithTutorLateness(conn: DbOrTx) {
  const cutoff = new Date(Date.now() - LATENESS_TOLERANCE_MS);
  const tutorAttended = conn
    .select({ id: bookingParticipant.id })
    .from(bookingParticipant)
    .where(
      and(
        eq(bookingParticipant.bookingId, booking.id),
        eq(bookingParticipant.role, "tutor"),
        inArray(bookingParticipant.attendanceState, [
          "present",
          "late",
          "absent",
        ]),
      ),
    );
  return conn
    .select()
    .from(booking)
    .where(
      and(
        eq(booking.currentState, "scheduled"),
        lt(booking.scheduledStartAt, cutoff),
        notExists(tutorAttended),
      ),
    )
    .limit(500);
}

async function findTutorParticipant(
  conn: DbOrTx,
  bookingId: string,
): Promise<typeof bookingParticipant.$inferSelect | null> {
  const [participant] = await conn
    .select()
    .from(bookingParticipant)
    .where(
      and(
        eq(bookingParticipant.bookingId, bookingId),
        eq(bookingParticipant.role, "tutor"),
      ),
    )
    .limit(1);
  return participant ?? null;
}

/**
 * Decrements a booking's confirmed headcount (floored at 0).
 *
 * @param conn - the database connection or active transaction
 * @param bookingId - the booking id
 */
async function decrementBookingConfirmedHeadcount(
  conn: DbOrTx,
  bookingId: string,
) {
  await conn
    .update(booking)
    .set({
      confirmedHeadcount: sql`GREATEST(${booking.confirmedHeadcount} - 1, 0)`,
    })
    .where(eq(booking.id, bookingId));
}

/**
 * Marks all sessions of a series booking as cancelled.
 *
 * @param conn - the database connection or active transaction
 * @param bookingId - the series booking id
 */
async function cancelAllSessions(conn: DbOrTx, bookingId: string) {
  await conn
    .update(bookingSession)
    .set({ currentState: "cancelled" })
    .where(eq(bookingSession.seriesBookingId, bookingId));
}

/**
 * Updates a booking with optimistic concurrency via version, returning the new row and version.
 *
 * @param conn - the database connection or active transaction
 * @param bookingId - the booking id
 * @param expectedVersion - the version the booking must currently have
 * @param updates - the fields to update
 * @returns the updated row and new version, or null when the version did not match
 */
async function updateBookingVersioned(
  conn: DbOrTx,
  bookingId: string,
  expectedVersion: number,
  updates: Partial<
    Pick<
      typeof bookingTable.$inferInsert,
      | "currentState"
      | "previousState"
      | "stateReason"
      | "cancellationReason"
      | "holdAmount"
      | "confirmedHeadcount"
      | "overrideMeta"
    >
  >,
): Promise<{
  updated: typeof bookingTable.$inferSelect;
  newVersion: number;
} | null> {
  const result = await conn
    .update(booking)
    .set({
      ...updates,
      version: sql`${booking.version} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(booking.id, bookingId), eq(booking.version, expectedVersion)))
    .returning();

  if (!result.length) return null;
  const updated = result[0]!;
  return {
    updated: updated as typeof bookingTable.$inferSelect,
    newVersion: expectedVersion + 1,
  };
}

export function createBookingRepo(db: DbType) {
  /**
   * Finds a booking with participants, state history, meeting, and room bookings eager-loaded.
   *
   * @param bookingId - the booking id
   * @returns the booking with related data, or null
   */
  async function findBookingWithParticipants(bookingId: string) {
    return db.query.booking.findFirst({
      where: eq(booking.id, bookingId),
      with: {
        participants: { with: { user: true } },
        stateHistory: true,
        meeting: true,
        roomBookings: { with: { room: true } },
      },
    });
  }

  /**
   * Lists a proposer's bookings with cursor pagination and optional state filter.
   *
   * @param proposerId - the proposer's user id
   * @param opts - pagination and state options
   * @returns the matching bookings with participants, newest first
   */
  async function listBookingsByProposer(
    proposerId: string,
    opts: { states?: string[]; limit: number; cursor?: string },
  ) {
    const conditions = [eq(booking.proposerId, proposerId)];
    if (opts.states?.length) {
      conditions.push(inArray(booking.currentState, opts.states));
    }
    if (opts.cursor) {
      conditions.push(lt(booking.scheduledStartAt, new Date(opts.cursor)));
    }
    return db.query.booking.findMany({
      where: and(...conditions),
      orderBy: [desc(booking.scheduledStartAt)],
      limit: opts.limit + 1,
      with: { participants: { with: { user: true } } },
    });
  }

  return {
    findBookingById,
    findBookingWithParticipants,
    listBookingsByProposer,
    findTutorProfile,
    findAvailabilitySlot,
    findParticipant,
    findConfirmedParticipants,
    findReconfirmedParticipants,
    insertBooking,
    updateBookingCancellationReason,
    updateBookingHoldAmount,
    updateBookingConfirmedHeadcount,
    insertParticipant,
    updateParticipantState,
    insertStateHistory,
    insertRescheduleProposal,
    insertBookingSession,
    listSessionsBySeriesId,
    findBookingsExpiringByDeadline,
    findBookingsWithTutorLateness,
    findTutorParticipant,
    findOverlappingBookings,
    updateBookingVersioned,
    updateBookingDeadline,
    decrementBookingConfirmedHeadcount,
    cancelAllSessions,
  };
}

export type BookingRepo = ReturnType<typeof createBookingRepo>;
