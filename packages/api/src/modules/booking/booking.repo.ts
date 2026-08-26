import {
  eq,
  and,
  or,
  gte,
  asc,
  desc,
  inArray,
  notInArray,
  ne,
  lte,
  lt,
  gt,
  sql,
  getTableColumns,
  not,
  notExists,
  exists,
  type SQL,
} from "drizzle-orm";
import {
  booking,
  bookingParticipant,
  bookingStateHistory,
  bookingRescheduleProposal,
  bookingSession,
  sessionNote,
  availabilitySlot,
  tutorProfile,
  user,
  meetingEvent,
  type booking as bookingTable,
} from "@cogito-app/db/schema";
import type { DbType } from "../../lib/db";
import type { DbOrTx } from "../../lib/tx";
import {
  CONFIRMATION_STATE,
  ONBOARDING_STATUS,
  LATENESS_TOLERANCE_MS,
  MODALITY,
  MAX_MEETING_RETRY_ATTEMPTS,
} from "../../shared/constants";
import { BOOKING_STATE } from "./booking-state.types";

type BookingRow = typeof bookingTable.$inferSelect;

/**
 * M3: encodes a composite `(scheduledStartAt, id)` cursor into the opaque cursor
 * string returned to clients. The `|` separator is safe because neither an ISO
 * timestamp nor a UUID contains it.
 */
export function encodeBookingCursor(
  scheduledStartAt: Date,
  id: string,
): string {
  return `${scheduledStartAt.toISOString()}|${id}`;
}

/**
 * M3: decodes a composite cursor string back into its `(scheduledStartAt, id)`
 * parts. A legacy cursor (a bare ISO timestamp, as produced before the M3 fix)
 * is still accepted and yields a `null` id so the tie-break is skipped.
 */
export function decodeBookingCursor(cursor: string): {
  scheduledStartAt: Date;
  id: string | null;
} {
  const sep = cursor.indexOf("|");
  if (sep === -1) {
    return { scheduledStartAt: new Date(cursor), id: null };
  }
  return {
    scheduledStartAt: new Date(cursor.slice(0, sep)),
    id: cursor.slice(sep + 1) || null,
  };
}

/**
 * M3: builds the composite `(scheduledStartAt, id)` cursor predicate so bookings
 * sharing an identical `scheduledStartAt` are not skipped across pages. Mirrors
 * the `(createdAt, id)` composite cursor used by the wallet ledger.
 */
function bookingCursorCondition(cursor: string): SQL<unknown> {
  const { scheduledStartAt, id } = decodeBookingCursor(cursor);
  if (!id) {
    // Legacy cursor: no id tie-break available.
    return lt(booking.scheduledStartAt, scheduledStartAt);
  }
  return or(
    lt(booking.scheduledStartAt, scheduledStartAt),
    and(eq(booking.scheduledStartAt, scheduledStartAt), lt(booking.id, id)),
  )!;
}

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

async function findAvailabilityWindowContaining(
  conn: DbOrTx,
  tutorId: string,
  startAt: Date,
  endAt: Date,
) {
  return conn.query.availabilitySlot.findFirst({
    where: and(
      eq(availabilitySlot.tutorId, tutorId),
      eq(availabilitySlot.isActive, true),
      lte(availabilitySlot.startDate, startAt),
      gte(availabilitySlot.endDate, endAt),
    ),
  });
}

async function listActiveTutorAvailability(conn: DbOrTx, tutorId: string) {
  return conn.query.availabilitySlot.findMany({
    where: and(
      eq(availabilitySlot.tutorId, tutorId),
      eq(availabilitySlot.isActive, true),
      gte(availabilitySlot.endDate, new Date()),
    ),
    orderBy: [asc(availabilitySlot.startDate)],
    limit: 100,
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
 * F8: the tutor attendance row (role='tutor') is never included — the tutor
 * marks attendance via a participant row with confirmationState=CONFIRMED,
 * which must not inflate group repricing headcounts or hold math.
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
    ne(bookingParticipant.role, "tutor"),
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

async function findUserEmails(
  conn: DbOrTx,
  userIds: string[],
): Promise<{ id: string; email: string; name: string }[]> {
  if (userIds.length === 0) return [];
  return conn
    .select({ id: user.id, email: user.email, name: user.name })
    .from(user)
    .where(inArray(user.id, userIds));
}

/**
 * Resolves registered users by id (used to validate group-series invitees).
 *
 * @param conn - the database connection or active transaction
 * @param userIds - the user ids to look up
 * @returns the matching user rows
 */
async function findUsersByIds(conn: DbOrTx, userIds: string[]) {
  if (userIds.length === 0) return [];
  return conn
    .select({ id: user.id })
    .from(user)
    .where(inArray(user.id, userIds));
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
 * Resets RECONFIRMED participants back to CONFIRMED and clears their
 * reconfirmation timestamp. Used when a headcount change during the
 * reconfirmation window forces a re-issued reconfirmation round (F3).
 *
 * @param conn - the database connection or active transaction
 * @param bookingId - the booking id
 */
async function resetReconfirmedParticipants(conn: DbOrTx, bookingId: string) {
  await conn
    .update(bookingParticipant)
    .set({
      confirmationState: CONFIRMATION_STATE.CONFIRMED,
      reconfirmedAt: null,
    })
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

async function updateBookingPriceSnapshot(
  conn: DbOrTx,
  bookingId: string,
  values: {
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
    holdAmount: number;
  },
) {
  await conn.update(booking).set(values).where(eq(booking.id, bookingId));
}

/**
 * Atomically increments a booking's confirmed headcount by 1 and returns the
 * fresh booking row. The increment happens in SQL so concurrent confirms can
 * never lose updates.
 *
 * @param conn - the database connection or active transaction
 * @param bookingId - the booking id
 * @returns the updated booking row
 */
async function incrementBookingConfirmedHeadcount(
  conn: DbOrTx,
  bookingId: string,
) {
  const [row] = await conn
    .update(booking)
    .set({
      confirmedHeadcount: sql`${booking.confirmedHeadcount} + 1`,
    })
    .where(eq(booking.id, bookingId))
    .returning();
  if (!row)
    throw new Error(`Booking ${bookingId} not found for headcount increment`);
  return row;
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
    sessionId?: string;
    proposedBy: string;
    proposedStartAt: Date;
    proposedEndAt: Date;
    reason?: string;
    expiresAt: Date;
    decisions: Record<string, "pending" | "accepted" | "rejected">;
    status: string;
  },
) {
  await conn.insert(bookingRescheduleProposal).values(values);
}

async function updateBookingSessionTimes(
  conn: DbOrTx,
  sessionId: string,
  values: { scheduledStartAt: Date; scheduledEndAt: Date },
) {
  await conn
    .update(bookingSession)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(bookingSession.id, sessionId));
}

async function findPendingRescheduleProposal(conn: DbOrTx, bookingId: string) {
  const [proposal] = await conn
    .select({ ...getTableColumns(bookingRescheduleProposal) })
    .from(bookingRescheduleProposal)
    .where(
      and(
        eq(bookingRescheduleProposal.bookingId, bookingId),
        eq(bookingRescheduleProposal.status, "pending"),
      ),
    )
    .orderBy(desc(bookingRescheduleProposal.createdAt))
    .limit(1);
  return proposal ?? null;
}

async function updateRescheduleProposal(
  conn: DbOrTx,
  proposalId: string,
  values: {
    status?: string;
    decidedAt?: Date;
    decisions?: Record<string, "pending" | "accepted" | "rejected">;
  },
) {
  await conn
    .update(bookingRescheduleProposal)
    .set(values)
    .where(eq(bookingRescheduleProposal.id, proposalId));
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

async function findSessionById(conn: DbOrTx, sessionId: string) {
  const [session] = await conn
    .select({ ...getTableColumns(bookingSession) })
    .from(bookingSession)
    .where(eq(bookingSession.id, sessionId))
    .limit(1);
  return session ?? null;
}

async function updateSessionSchedule(
  conn: DbOrTx,
  sessionId: string,
  values: { scheduledStartAt: Date; scheduledEndAt: Date },
) {
  await conn
    .update(bookingSession)
    .set(values)
    .where(eq(bookingSession.id, sessionId));
}

async function cancelSession(conn: DbOrTx, sessionId: string) {
  await conn
    .update(bookingSession)
    .set({ currentState: "cancelled", holdAmount: 0 })
    .where(eq(bookingSession.id, sessionId));
}

async function completeSession(conn: DbOrTx, sessionId: string) {
  await conn
    .update(bookingSession)
    .set({ currentState: BOOKING_STATE.COMPLETED })
    .where(eq(bookingSession.id, sessionId));
}

async function insertSessionNote(
  conn: DbOrTx,
  values: { bookingId: string; authorId: string; content: string },
) {
  const [note] = await conn.insert(sessionNote).values(values).returning();
  return note!;
}

async function listSessionNotes(conn: DbOrTx, bookingId: string) {
  return conn
    .select({ ...getTableColumns(sessionNote) })
    .from(sessionNote)
    .where(eq(sessionNote.bookingId, bookingId))
    .orderBy(desc(sessionNote.createdAt));
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
    // Half-open intervals: [start, end). Back-to-back 90-minute sessions do
    // not overlap, while any shared minute does.
    lt(booking.scheduledStartAt, endAt),
    gt(booking.scheduledEndAt, startAt),
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

async function updateBookingSchedule(
  conn: DbOrTx,
  bookingId: string,
  values: { scheduledStartAt: Date; scheduledEndAt: Date },
) {
  await conn.update(booking).set(values).where(eq(booking.id, bookingId));
}

/**
 * Finds bookings whose deadline has passed and whose state is in the given set (for expiry).
 *
 * @param conn - the database connection or active transaction
 * @param states - states eligible for expiry
 * @returns up to 100 matching booking rows (per scheduler run)
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
    .limit(100);
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
    .select({ ...getTableColumns(booking) })
    .from(booking)
    .where(
      and(
        eq(booking.currentState, "scheduled"),
        lt(booking.scheduledStartAt, cutoff),
        // Already-flagged bookings stay SCHEDULED with holds intact (admin
        // queue), so exclude them here to keep flagging idempotent — otherwise
        // every 5-min sweep re-flags the same booking.
        not(
          eq(
            sql`coalesce(${booking.overrideMeta}->>'category', '')`,
            "tutor_lateness_pending",
          ),
        ),
        notExists(tutorAttended),
      ),
    )
    .limit(100);
}

/**
 * Finds confirmed online bookings whose Google Meet creation failed, for the
 * `retry-failed-meetings` scheduler job. Each failed create attempt inserts a
 * `meetingEvent` row with status `failed`, so the retry budget is derived from
 * the count of failed rows — bookings stop being retried after
 * `MAX_MEETING_RETRY_ATTEMPTS` failures and are left for authorized manual
 * intervention (tutor or admin meeting-link entry, see PRD-GAPS-PHASE3 U1).
 *
 * @param conn - the database connection or active transaction
 * @param limit - the maximum number of bookings to return
 * @returns the confirmed online bookings with a failed meeting and retries left
 */
async function findConfirmedMeetingsPendingRetry(
  conn: DbOrTx,
  limit = 50,
): Promise<BookingRow[]> {
  const failedAttempts = conn
    .select({ count: sql<number>`count(*)::int` })
    .from(meetingEvent)
    .where(
      and(
        eq(meetingEvent.bookingId, booking.id),
        eq(meetingEvent.provider, "google_meet"),
        eq(meetingEvent.status, "failed"),
      ),
    );
  const hasFailedAttempt = conn
    .select({ id: meetingEvent.id })
    .from(meetingEvent)
    .where(
      and(
        eq(meetingEvent.bookingId, booking.id),
        eq(meetingEvent.provider, "google_meet"),
        eq(meetingEvent.status, "failed"),
      ),
    );
  return conn
    .select({ ...getTableColumns(booking) })
    .from(booking)
    .where(
      and(
        eq(booking.currentState, BOOKING_STATE.CONFIRMED),
        eq(booking.modality, MODALITY.ONLINE),
        exists(hasFailedAttempt),
        lt(failedAttempts, MAX_MEETING_RETRY_ATTEMPTS),
      ),
    )
    .limit(limit);
}

async function findTutorParticipant(
  conn: DbOrTx,
  bookingId: string,
): Promise<typeof bookingParticipant.$inferSelect | null> {
  const [participant] = await conn
    .select({ ...getTableColumns(bookingParticipant) })
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
 * Marks all non-completed sessions of a series booking as cancelled.
 *
 * Completed sessions are never clobbered (TC-30): only `scheduled` sessions
 * transition to `cancelled`.
 *
 * @param conn - the database connection or active transaction
 * @param bookingId - the series booking id
 */
async function cancelAllSessions(conn: DbOrTx, bookingId: string) {
  await conn
    .update(bookingSession)
    .set({ currentState: "cancelled" })
    .where(
      and(
        eq(bookingSession.seriesBookingId, bookingId),
        eq(bookingSession.currentState, BOOKING_STATE.SCHEDULED),
      ),
    );
}

async function findCompletedBookingsByTutor(
  conn: DbOrTx,
  tutorId: string,
  dateFrom?: Date,
  dateTo?: Date,
): Promise<BookingRow[]> {
  const conditions = [
    eq(booking.tutorId, tutorId),
    eq(booking.currentState, BOOKING_STATE.COMPLETED),
  ];
  if (dateFrom) {
    conditions.push(gte(booking.scheduledStartAt, dateFrom));
  }
  if (dateTo) {
    conditions.push(lte(booking.scheduledStartAt, dateTo));
  }
  return conn
    .select({ ...getTableColumns(booking) })
    .from(booking)
    .where(and(...conditions));
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
    // The `meeting` one-relation returns an unspecified row when a booking has
    // multiple meeting_event rows (e.g. a pre-fix google-failed row plus the
    // manual fallback). Fetch the newest explicitly so G11 status is stable.
    const [meetingRow] = await db
      .select({ ...getTableColumns(meetingEvent) })
      .from(meetingEvent)
      .where(eq(meetingEvent.bookingId, bookingId))
      .orderBy(desc(meetingEvent.createdAt), desc(meetingEvent.id))
      .limit(1);

    const b = await db.query.booking.findFirst({
      where: eq(booking.id, bookingId),
      with: {
        tutor: true,
        proposer: true,
        participants: { with: { user: true } },
        stateHistory: {
          orderBy: [
            desc(bookingStateHistory.createdAt),
            desc(bookingStateHistory.id),
          ],
        },
        rescheduleProposals: {
          orderBy: [desc(bookingRescheduleProposal.createdAt)],
          limit: 10,
        },
        sessions: true,
        roomBookings: { with: { room: true } },
      },
    });
    if (!b) return null;
    return { ...b, meeting: meetingRow ?? null };
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
      conditions.push(bookingCursorCondition(opts.cursor));
    }
    return db.query.booking.findMany({
      where: and(...conditions),
      orderBy: [desc(booking.scheduledStartAt), desc(booking.id)],
      limit: opts.limit + 1,
      with: {
        tutor: true,
        proposer: true,
        participants: { with: { user: true } },
        roomBookings: { with: { room: true } },
      },
    });
  }

  async function listBookingsByTutor(
    tutorId: string,
    opts: { states?: string[]; limit: number; cursor?: string },
  ) {
    const conditions = [eq(booking.tutorId, tutorId)];
    if (opts.states?.length) {
      conditions.push(inArray(booking.currentState, opts.states));
    }
    if (opts.cursor) {
      conditions.push(bookingCursorCondition(opts.cursor));
    }
    return db.query.booking.findMany({
      where: and(...conditions),
      orderBy: [desc(booking.scheduledStartAt), desc(booking.id)],
      limit: opts.limit + 1,
      with: {
        tutor: true,
        proposer: true,
        participants: { with: { user: true } },
        roomBookings: { with: { room: true } },
      },
    });
  }

  /**
   * Lists every booking visible to a signed-in viewer. Students see bookings
   * they proposed or joined, tutors see assigned bookings, and admins see the
   * complete booking set. The relation checks stay server-side so the list
   * cannot be widened by a client-provided user id.
   */
  async function listBookingsForAccess(
    userId: string,
    opts: {
      states?: string[];
      limit: number;
      cursor?: string;
      includeAll?: boolean;
    },
  ) {
    const conditions = [];
    if (!opts.includeAll) {
      const participantBooking = db
        .select({ id: bookingParticipant.id })
        .from(bookingParticipant)
        .where(
          and(
            eq(bookingParticipant.bookingId, booking.id),
            eq(bookingParticipant.userId, userId),
          ),
        );
      conditions.push(
        or(
          eq(booking.proposerId, userId),
          eq(booking.tutorId, userId),
          exists(participantBooking),
        ),
      );
    }
    if (opts.states?.length) {
      conditions.push(inArray(booking.currentState, opts.states));
    }
    if (opts.cursor) {
      conditions.push(bookingCursorCondition(opts.cursor));
    }

    return db.query.booking.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: [desc(booking.scheduledStartAt), desc(booking.id)],
      limit: opts.limit + 1,
      with: {
        tutor: true,
        proposer: true,
        participants: { with: { user: true } },
        roomBookings: { with: { room: true } },
      },
    });
  }

  return {
    findBookingById,
    findBookingWithParticipants,
    listBookingsByProposer,
    listBookingsByTutor,
    listBookingsForAccess,
    findTutorProfile,
    findAvailabilitySlot,
    findAvailabilityWindowContaining,
    listActiveTutorAvailability,
    findParticipant,
    findConfirmedParticipants,
    findUserEmails,
    findUsersByIds,
    findReconfirmedParticipants,
    resetReconfirmedParticipants,
    insertBooking,
    updateBookingCancellationReason,
    updateBookingHoldAmount,
    incrementBookingConfirmedHeadcount,
    insertParticipant,
    updateParticipantState,
    insertStateHistory,
    insertRescheduleProposal,
    findPendingRescheduleProposal,
    updateBookingSessionTimes,
    updateRescheduleProposal,
    insertBookingSession,
    findSessionById,
    updateSessionSchedule,
    cancelSession,
    completeSession,
    insertSessionNote,
    listSessionNotes,
    listSessionsBySeriesId,
    updateBookingPriceSnapshot,
    updateBookingSchedule,
    findBookingsExpiringByDeadline,
    findBookingsWithTutorLateness,
    findConfirmedMeetingsPendingRetry,
    findTutorParticipant,
    findOverlappingBookings,
    updateBookingVersioned,
    updateBookingDeadline,
    decrementBookingConfirmedHeadcount,
    cancelAllSessions,
    findCompletedBookingsByTutor,
  };
}

export type BookingRepo = ReturnType<typeof createBookingRepo>;
