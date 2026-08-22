import { env } from "@cogito-app/env/server";
import {
  BOOKING_TYPE,
  MODALITY,
  CONFIRMATION_STATE,
  NOTIFICATION_CATEGORY,
  NOTIFICATION_SEVERITY,
  ACTOR_TYPE,
  ATTENDANCE_STATE,
  RESPONSE_WINDOW_MS,
  OFFLINE_SCHEDULED_GRACE_MS,
  LATE_CANCEL_THRESHOLD_MS,
  LATENESS_TOLERANCE_MS,
  MIN_GROUP_HEADCOUNT,
  MIN_SERIES_SESSIONS,
  MAX_SERIES_SESSIONS,
  DEFAULT_SOLO_PRICE,
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
  GROUP_SERIES_DISCLAIMER,
  TUTOR_PAYOUT_RATE_IDR,
  SESSION_DURATION_MS,
} from "../../shared/constants";
import type { GroupSize, Modality } from "../pricing/pricing.service";
import type { DbType } from "../../lib/db";
import type { DbOrTx } from "../../lib/tx";
import {
  BookingNotFoundError,
  BookingNotOwnedError,
  BookingConflictError,
  BookingStateTransitionError,
  BookingNotEditableError,
  InsufficientMarksError,
  BookingNotAwaitingConfirmationError,
  BookingNotAwaitingReconfirmationError,
  BookingNotAwaitingReviewError,
  BookingSeriesSizeError,
  BookingParticipantNotFoundError,
  BookingParticipantAlreadyConfirmedError,
  BookingCancelledError,
  BookingSessionNotFoundError,
  BookingSessionNotCancellableError,
  BookingSessionRequiredError,
  BookingSessionNotStartedError,
  BookingRescheduleNotFoundError,
  BookingRescheduleNotPendingError,
  BookingNotCompletedError,
  BookingSeriesNoOptOutError,
  BookingAcceptanceDeadlinePassedError,
} from "./booking.errors";
import { escapeHtml, sanitizeHtml } from "../../lib/sanitize";
import { lockTutorForBooking } from "../../lib/locks";
import { mapLimit } from "../../lib/concurrency";
import { log } from "../../lib/logger";
import {
  BOOKING_STATE,
  TERMINAL_STATES,
  type BookingState,
} from "./booking-state.types";
import { canTransition, TRANSITIONS } from "./booking-transitions";
import type { BookingRepo } from "./booking.repo";
import { encodeBookingCursor } from "./booking.repo";
import type {
  BookingWalletPort,
  BookingPricingPort,
  BookingAuditPort,
  BookingNotificationPort,
  BookingMeetingPort,
  BookingRoomPort,
} from "./index";

/**
 * Terminal target per expiry-eligible state. Shared by `expireBookings` and
 * `releaseExpiredHolds` so both jobs agree on where a past-deadline booking
 * ends up (M4). RESCHEDULE_PROPOSED is handled by the proposal-expiry branch
 * in `expireBookings` (targets the pre-proposal state) and is deliberately
 * absent here.
 */
const EXPIRY_TARGET: Record<string, BookingState> = {
  [BOOKING_STATE.SCHEDULED]: BOOKING_STATE.NO_SHOW,
  [BOOKING_STATE.AWAITING_ADMIN_ROOM_APPROVAL]: BOOKING_STATE.CANCELLED,
};

export interface CreateSoloInput {
  tutorId: string;
  availabilitySlotId: string;
  modality: "online" | "offline";
  scheduledStartAt: Date;
  scheduledEndAt?: Date;
  timezone: string;
  learningGoal?: string;
  requestedRoomId?: string;
}

export interface CreateGroupInput {
  tutorId: string;
  availabilitySlotId: string;
  modality: "online" | "offline";
  targetGroupSize: number;
  inviteeUserIds: string[];
  scheduledStartAt: Date;
  scheduledEndAt?: Date;
  timezone: string;
  learningGoal?: string;
  requestedRoomId?: string;
}

export interface CreateSeriesInput {
  tutorId: string;
  availabilitySlotId: string;
  modality: "online" | "offline";
  sessions: {
    availabilitySlotId?: string;
    scheduledStartAt: Date;
    scheduledEndAt?: Date;
  }[];
  timezone: string;
  learningGoal?: string;
}

export interface CreateGroupSeriesInput {
  tutorId: string;
  availabilitySlotId: string;
  modality: "online" | "offline";
  targetGroupSize: number;
  inviteeUserIds: string[];
  sessions: {
    availabilitySlotId?: string;
    scheduledStartAt: Date;
    scheduledEndAt?: Date;
  }[];
  timezone: string;
  learningGoal?: string;
}

export interface TutorPayoutResult {
  completedSessions: number;
  totalMarks: number;
  cogitoTake: number;
  tutorPayout: number;
  tutorPayoutIdr: number;
}

export interface BookingTransition {
  bookingId: string;
  fromState: BookingState | null;
  toState: BookingState;
  reason?: string;
  actorId: string | null;
  actorType: "student" | "tutor" | "admin" | "system";
  metadata?: Record<string, unknown>;
}

export type MeetingStatus = "pending" | "ready" | "failed";

/**
 * Derives the frontend-facing meeting status for a booking.
 *
 * `meeting.createEvent` fires only on tutor accept (online bookings), and
 * for group bookings tutor accept only happens after every participant
 * confirmed — so "all confirmed AND tutor accepted" is satisfied by
 * construction. Withdrawal after creation does not revoke the link. A
 * non-failed provider row without a URL stays pending rather than being
 * reported as ready, so the detail page never renders an empty link as usable.
 */
function computeMeetingInfo(b: {
  meeting: { status: string; meetingUrl: string | null } | null;
}): { meetingStatus: MeetingStatus; meetingUrl: string | null } {
  const event = b.meeting;
  if (!event) {
    return { meetingStatus: "pending", meetingUrl: null };
  }
  if (event.status === "failed") {
    return { meetingStatus: "failed", meetingUrl: null };
  }
  if (
    event.status === "pending" ||
    event.status === "manual" ||
    event.status === "cancelled" ||
    !event.meetingUrl
  ) {
    return { meetingStatus: "pending", meetingUrl: null };
  }
  return { meetingStatus: "ready", meetingUrl: event.meetingUrl };
}

export type BookingService = ReturnType<typeof createBookingService>;

type BookingRow = NonNullable<
  Awaited<ReturnType<BookingRepo["findBookingById"]>>
>;

/**
 * Creates the booking service orchestrating bookings, wallet holds, pricing, notifications, and meeting creation.
 *
 * @param deps - the dependency ports (db, repo, wallet, pricing, audit, notification, meeting)
 * @returns a BookingService with create/list/action methods and scheduler helpers
 */
export function createBookingService(deps: {
  db: DbType;
  repo: BookingRepo;
  wallet: BookingWalletPort;
  pricing: BookingPricingPort;
  audit: BookingAuditPort;
  notification: BookingNotificationPort;
  meeting: BookingMeetingPort;
  roomPort?: BookingRoomPort;
}) {
  const { db, repo, wallet, pricing, audit, notification, meeting, roomPort } =
    deps;

  async function assertBookingAccess(
    b: { proposerId: string; tutorId: string },
    userId: string,
    conn: DbOrTx,
    bookingId: string,
  ): Promise<void> {
    if (b.proposerId !== userId) {
      if (b.tutorId === userId) return;
      const participant = await repo.findParticipant(conn, bookingId, userId);
      if (!participant) {
        throw new BookingNotOwnedError(bookingId, userId);
      }
    }
  }

  async function loadBookingAndAssertAccess(
    conn: DbOrTx,
    userId: string,
    bookingId: string,
  ) {
    const b = await repo.findBookingById(conn, bookingId);
    if (!b) throw new BookingNotFoundError(bookingId);
    await assertBookingAccess(b, userId, conn, bookingId);
    return b;
  }

  async function recordTransition(conn: DbOrTx, entry: BookingTransition) {
    await repo.insertStateHistory(conn, {
      bookingId: entry.bookingId,
      fromState: entry.fromState,
      toState: entry.toState,
      reason: entry.reason,
      // system actors carry no user row; transition() below nulls actorId
      // before it reaches recordTransition.
      actorId: entry.actorId,
      actorType: entry.actorType,
      metadata: entry.metadata,
    });
  }

  async function transition(
    conn: DbOrTx,
    bookingId: string,
    toState: BookingState,
    params: {
      reason?: string;
      actorId: string;
      actorType: "student" | "tutor" | "admin" | "system";
      metadata?: Record<string, unknown>;
    },
  ) {
    const b = await repo.findBookingById(conn, bookingId);
    if (!b) throw new BookingNotFoundError(bookingId);
    const fromState = b.currentState as BookingState;

    if (!canTransition(fromState, toState)) {
      throw new BookingStateTransitionError(fromState, "transition", toState);
    }

    const versioned = await repo.updateBookingVersioned(
      conn,
      bookingId,
      b.version,
      {
        currentState: toState,
        previousState: fromState,
        stateReason: params.reason ?? null,
      },
    );
    if (!versioned) {
      throw new BookingStateTransitionError(
        fromState,
        "version_conflict",
        toState,
      );
    }

    await recordTransition(conn, {
      bookingId,
      fromState,
      toState,
      reason: params.reason,
      actorId: params.actorType === "system" ? null : params.actorId,
      actorType: params.actorType,
      metadata: params.metadata,
    });

    return versioned.updated;
  }

  async function releaseAllParticipantHolds(
    tx: DbOrTx,
    bookingId: string,
    reason: string,
    actorType: "student" | "tutor" | "admin" | "system",
    excludeUserId?: string,
  ): Promise<void> {
    const participants = await repo.findConfirmedParticipants(
      tx,
      bookingId,
      excludeUserId,
    );
    for (const p of participants) {
      if (p.heldAmount > 0) {
        const w = await wallet.getByUserId(tx, p.userId);
        if (w) {
          // eslint-disable-next-line no-await-in-loop
          await wallet.release(tx, {
            walletId: w.id,
            amount: p.heldAmount,
            eventKey: `booking.${bookingId}.release.${p.userId}`,
            sourceReference: bookingId,
            bookingId,
            actorType,
            reason,
          });
        }
      }
      // eslint-disable-next-line no-await-in-loop
      await repo.updateParticipantState(tx, p.id, {
        confirmationState: CONFIRMATION_STATE.WITHDRAWN_PRE_H2,
        withdrawnAt: new Date(),
        withdrawnReason: reason,
        heldAmount: 0,
      });
    }
  }

  /**
   * Recalculates per-student price and adjusts holds when a group booking's
   * confirmed headcount changes. Called from withdraw()/reconfirm().
   *
   * If a remaining participant cannot cover an increased hold, an
   * InsufficientMarksError is thrown inside the caller's transaction, rolling
   * back the headcount change.
   */
  async function repriceGroupForHeadcount(
    tx: DbOrTx,
    b: {
      id: string;
      type: string;
      tutorId: string;

      modality: string;
      priceSnapshot: { perStudent: number } | null;
    },
    remaining: { id: string; userId: string; heldAmount: number }[],
    actorType: "student" | "tutor" | "system",
  ): Promise<void> {
    if (b.type !== BOOKING_TYPE.GROUP) return;
    if (remaining.length < MIN_GROUP_HEADCOUNT) return;

    const profile = await repo.findTutorProfile(tx, b.tutorId);
    if (!profile) {
      log({
        level: "warn",
        action: "group_reprice_skipped",
        bookingId: b.id,
        message: "Tutor profile missing; group repricing skipped",
      });
      return;
    }

    const newSize = remaining.length;
    const newSnapshot = await computePriceSnapshot(
      tx,
      profile,
      b.modality as Modality,
      newSize as GroupSize,
      b.priceSnapshot,
    );
    const newPerStudent = newSnapshot.perStudent;
    const oldPerStudent = b.priceSnapshot?.perStudent ?? newPerStudent;

    if (newPerStudent === oldPerStudent) return;

    for (const p of remaining) {
      if (p.heldAmount === newPerStudent) continue;
      // eslint-disable-next-line no-await-in-loop
      const w = await wallet.getByUserId(tx, p.userId);
      if (!w) throw new BookingNotFoundError(p.userId);

      if (newPerStudent > p.heldAmount) {
        const delta = newPerStudent - p.heldAmount;
        if (w.availableBalance < delta) {
          throw new InsufficientMarksError(
            newPerStudent,
            w.availableBalance + p.heldAmount,
          );
        }
        // eslint-disable-next-line no-await-in-loop
        await wallet.hold(tx, {
          walletId: w.id,
          amount: delta,
          eventKey: `booking.${b.id}.reprice.increase.${p.userId}.${newPerStudent}`,
          sourceReference: b.id,
          bookingId: b.id,
          actorType,
          reason: "Group repricing: increased hold for new headcount",
        });
      } else if (newPerStudent < p.heldAmount) {
        // eslint-disable-next-line no-await-in-loop
        await wallet.release(tx, {
          walletId: w.id,
          amount: p.heldAmount - newPerStudent,
          eventKey: `booking.${b.id}.reprice.release.${p.userId}.${newPerStudent}`,
          sourceReference: b.id,
          bookingId: b.id,
          actorType,
          reason: "Group repricing: released excess hold",
        });
      }
      // eslint-disable-next-line no-await-in-loop
      await repo.updateParticipantState(tx, p.id, {
        heldAmount: newPerStudent,
      });
    }

    await repo.updateBookingPriceSnapshot(tx, b.id, {
      priceSnapshot: newSnapshot,
      holdAmount: newPerStudent * newSize,
    });

    for (const p of remaining) {
      // eslint-disable-next-line no-await-in-loop
      await notification.writeBestEffort({
        db: tx,
        userId: p.userId,
        bookingId: b.id,
        category: NOTIFICATION_CATEGORY.BOOKING,
        severity: NOTIFICATION_SEVERITY.ACTION,
        title: "Group price updated",
        body: `Your group's per-student price changed to ${newPerStudent} Marks because the headcount changed.`,
        eventKey: `booking.${b.id}.reprice.${p.userId}.${newPerStudent}`,
        emailRequired: true,
      });
    }
  }

  function computeDisclaimer(b: {
    type: string;
    targetGroupSize: number;
  }): string | null {
    if (b.type !== BOOKING_TYPE.SERIES) return null;
    if (b.targetGroupSize > 1) return GROUP_SERIES_DISCLAIMER;
    return null;
  }

  /**
   * Builds the deep-link CTA used by the group/group-series invitee email so
   * an invited student can view and accept the invite directly in-platform.
   */
  function formatInviteCta(bookingId: string): string {
    const origin = env.CORS_ORIGIN.replace(/\/$/, "");
    return `${origin}/bookings/${bookingId}`;
  }

  function normalizeSession(startAt: Date) {
    return {
      scheduledStartAt: startAt,
      scheduledEndAt: new Date(startAt.getTime() + SESSION_DURATION_MS),
    };
  }

  type EconomicSnapshot = {
    perStudent: number;
    markValueIdr?: number;
    economyVersion?: number;
    tutorBaseRateIdr?: number;
    tutorIncrementIdr?: number;
    cogitoBaseTakeIdr?: number;
    cogitoIncrementIdr?: number;
  };

  /**
   * New tutor profiles use IDR base honoraria. Legacy profiles keep the old
   * Marks map until they are edited through onboarding, so existing bookings
   * and migrations remain readable while the new economy rolls out.
   */
  async function computePriceSnapshot(
    conn: DbOrTx,
    profile: {
      prices?: Record<string, number> | null;
      baseRatesIdr?: { online?: number; offline?: number } | null;
    },
    modality: Modality,
    groupSize: GroupSize,
    previousSnapshot?: EconomicSnapshot | null,
  ) {
    const baseRates = profile.baseRatesIdr;
    const baseRateIdr =
      previousSnapshot?.tutorBaseRateIdr ??
      (modality === MODALITY.OFFLINE ? baseRates?.offline : baseRates?.online);
    if (typeof baseRateIdr !== "number") {
      return pricing.computeSplit(
        modality,
        (profile.prices?.[String(groupSize)] ?? DEFAULT_SOLO_PRICE) as number,
        groupSize,
      );
    }

    if (!pricing.getEconomyConfig || !pricing.computeEconomics) {
      throw new Error("IDR pricing is not configured");
    }
    const current = await pricing.getEconomyConfig(conn);
    const config =
      previousSnapshot?.markValueIdr !== undefined
        ? {
            ...current,
            version: previousSnapshot.economyVersion ?? current.version,
            markValueIdr: previousSnapshot.markValueIdr,
            onlineTutorIncrementIdr:
              modality === MODALITY.ONLINE &&
              previousSnapshot.tutorIncrementIdr !== undefined
                ? previousSnapshot.tutorIncrementIdr
                : current.onlineTutorIncrementIdr,
            offlineTutorIncrementIdr:
              modality === MODALITY.OFFLINE &&
              previousSnapshot.tutorIncrementIdr !== undefined
                ? previousSnapshot.tutorIncrementIdr
                : current.offlineTutorIncrementIdr,
            onlineCogitoBaseIdr:
              modality === MODALITY.ONLINE &&
              previousSnapshot.cogitoBaseTakeIdr !== undefined
                ? previousSnapshot.cogitoBaseTakeIdr
                : current.onlineCogitoBaseIdr,
            offlineCogitoBaseIdr:
              modality === MODALITY.OFFLINE &&
              previousSnapshot.cogitoBaseTakeIdr !== undefined
                ? previousSnapshot.cogitoBaseTakeIdr
                : current.offlineCogitoBaseIdr,
            onlineCogitoIncrementIdr:
              modality === MODALITY.ONLINE &&
              previousSnapshot.cogitoIncrementIdr !== undefined
                ? previousSnapshot.cogitoIncrementIdr
                : current.onlineCogitoIncrementIdr,
            offlineCogitoIncrementIdr:
              modality === MODALITY.OFFLINE &&
              previousSnapshot.cogitoIncrementIdr !== undefined
                ? previousSnapshot.cogitoIncrementIdr
                : current.offlineCogitoIncrementIdr,
          }
        : current;

    return pricing.computeEconomics(modality, baseRateIdr, groupSize, config);
  }

  function assertSessionFitsAvailability(
    slot: { startDate: Date; endDate: Date; modality: string },
    session: { scheduledStartAt: Date; scheduledEndAt: Date },
    modality: "online" | "offline",
  ) {
    const supportsModality =
      slot.modality === "both" || slot.modality === modality;
    if (
      !supportsModality ||
      session.scheduledStartAt < slot.startDate ||
      session.scheduledEndAt > slot.endDate
    ) {
      throw new BookingNotEditableError(
        "The 90-minute session must fit inside the tutor availability window",
      );
    }
  }

  function assertNoIntraSeriesOverlap(
    sessions: { scheduledStartAt: Date; scheduledEndAt: Date }[],
  ): void {
    const sorted = [...sessions].toSorted(
      (a, b) => a.scheduledStartAt.getTime() - b.scheduledStartAt.getTime(),
    );
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]!;
      const curr = sorted[i]!;
      if (curr.scheduledStartAt.getTime() < prev.scheduledEndAt.getTime()) {
        throw new BookingConflictError(
          "series",
          prev.scheduledEndAt.toISOString(),
          curr.scheduledStartAt.toISOString(),
        );
      }
    }
  }

  /**
   * Derives the frontend-facing meeting status for a booking — see the
   * module-scope computeMeetingInfo.



  /**
  /**
  /**
   * Gets a booking by id, enforcing that the requesting user has access.
   *
   * @param bookingId - the booking to fetch
   * @param userId - the requesting user (proposer, tutor, or participant)
   * @returns the booking with participants and related data
   * @throws {BookingNotFoundError} if the booking does not exist
   * @throws {BookingNotOwnedError} if the user lacks access
   */
  async function getById(bookingId: string, userId: string, userRole?: string) {
    const b = await repo.findBookingWithParticipants(bookingId);
    if (!b) throw new BookingNotFoundError(bookingId);
    if (userRole !== "admin") {
      await assertBookingAccess(b, userId, db, bookingId);
    }
    return {
      ...b,
      disclaimer: computeDisclaimer(b),
      ...computeMeetingInfo(b),
    };
  }

  async function getRescheduleAvailability(bookingId: string, userId: string) {
    const b = await loadBookingAndAssertAccess(db, userId, bookingId);
    return repo.listActiveTutorAvailability(db, b.tutorId);
  }

  /**
   * Lists bookings where the user is the proposer, with cursor pagination.
   *
   * @param userId - the proposer user
   * @param opts - pagination and state filter options
   * @returns the bookings and a nextCursor when more pages exist
   */
  async function listMine(
    userId: string,
    opts: { cursor?: string; limit?: number; states?: string[] } = {},
  ) {
    const limit = Math.min(opts.limit ?? DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT);
    const rows = await repo.listBookingsByProposer(userId, {
      states: opts.states,
      limit,
      cursor: opts.cursor,
    });
    const items = rows.slice(0, limit);
    const nextCursor =
      rows.length > limit
        ? encodeBookingCursor(
            items[items.length - 1]!.scheduledStartAt,
            items[items.length - 1]!.id,
          )
        : null;
    return { items, nextCursor };
  }

  async function listForTutor(
    tutorId: string,
    opts: { cursor?: string; limit?: number; states?: string[] } = {},
  ) {
    const limit = Math.min(opts.limit ?? DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT);
    const rows = await repo.listBookingsByTutor(tutorId, {
      states: opts.states,
      limit,
      cursor: opts.cursor,
    });
    const items = rows.slice(0, limit);
    const nextCursor =
      rows.length > limit
        ? encodeBookingCursor(
            items[items.length - 1]!.scheduledStartAt,
            items[items.length - 1]!.id,
          )
        : null;
    return { items, nextCursor };
  }

  /**
   * Lists bookings visible to the signed-in role. This is the shared read
   * contract for the role-aware booking list: students include invitations,
   * tutors include assigned bookings, and admins include all bookings.
   */
  async function listAccessible(
    userId: string,
    userRole: string,
    opts: { cursor?: string; limit?: number; states?: string[] } = {},
  ) {
    const limit = Math.min(opts.limit ?? DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT);
    const rows = await repo.listBookingsForAccess(userId, {
      states: opts.states,
      limit,
      cursor: opts.cursor,
      includeAll: userRole === "admin",
    });
    const items = rows.slice(0, limit);
    const nextCursor =
      rows.length > limit
        ? encodeBookingCursor(
            items[items.length - 1]!.scheduledStartAt,
            items[items.length - 1]!.id,
          )
        : null;
    return { items, nextCursor };
  }

  /**
   * Creates a solo booking, holds Marks, and notifies the tutor.
   *
   * @param proposerId - the student creating the booking
   * @param input - the solo booking details
   * @returns the created booking
   * @throws {BookingNotFoundError} if the tutor profile or slot is invalid
   * @throws {InsufficientMarksError} if the student cannot cover the hold
   * @throws {BookingConflictError} if the tutor already has an overlapping booking
   */
  async function createSolo(proposerId: string, input: CreateSoloInput) {
    const profile = await repo.findTutorProfile(db, input.tutorId, {
      publishedOnly: true,
    });
    if (!profile) throw new BookingNotFoundError(input.tutorId);

    const slot = await repo.findAvailabilitySlot(
      db,
      input.availabilitySlotId,
      input.tutorId,
      { futureOnly: true },
    );
    if (!slot) throw new BookingNotEditableError(input.availabilitySlotId);

    const session = normalizeSession(input.scheduledStartAt);
    assertSessionFitsAvailability(slot, session, input.modality);

    const modality = input.modality;
    if (modality === MODALITY.OFFLINE && profile.modality === MODALITY.ONLINE) {
      throw new BookingNotEditableError(input.tutorId);
    }
    if (modality === MODALITY.ONLINE && profile.modality === MODALITY.OFFLINE) {
      throw new BookingNotEditableError(input.tutorId);
    }

    const priceSnapshot = await computePriceSnapshot(db, profile, modality, 1);
    const totalMarks = priceSnapshot.perStudent * 1;

    const w = await wallet.getByUserId(db, proposerId);
    if (!w) throw new BookingNotFoundError(proposerId);
    if (w.availableBalance < totalMarks) {
      throw new InsufficientMarksError(totalMarks, w.availableBalance);
    }

    const bookingId = crypto.randomUUID();
    const deadlineAt = new Date(Date.now() + RESPONSE_WINDOW_MS);

    return db.transaction(async (tx) => {
      await lockTutorForBooking(tx, input.tutorId);
      const overlapping = await repo.findOverlappingBookings(
        tx,
        input.tutorId,
        session.scheduledStartAt,
        session.scheduledEndAt,
        { excludeStates: [...TERMINAL_STATES] },
      );
      if (overlapping.length > 0) {
        throw new BookingConflictError(
          input.tutorId,
          session.scheduledStartAt.toISOString(),
          session.scheduledEndAt.toISOString(),
        );
      }

      await wallet.hold(tx, {
        walletId: w.id,
        amount: totalMarks,
        eventKey: `booking.${bookingId}.hold`,
        sourceReference: bookingId,
        bookingId,
        actorType: ACTOR_TYPE.STUDENT,
        reason: "Hold Marks for solo booking",
      });

      const b = await repo.insertBooking(tx, {
        id: bookingId,
        type: BOOKING_TYPE.SOLO,
        modality,
        tutorId: input.tutorId,
        proposerId,
        targetGroupSize: 1,
        minConfirmedHeadcount: 1,
        confirmedHeadcount: 1,
        currentState: BOOKING_STATE.AWAITING_TUTOR_REVIEW,
        scheduledStartAt: session.scheduledStartAt,
        scheduledEndAt: session.scheduledEndAt,
        timezone: input.timezone,
        learningGoal: input.learningGoal ?? "",
        priceSnapshot,
        originalMarks: totalMarks,
        holdAmount: totalMarks,
        deadlineAt,
      });

      await repo.insertParticipant(tx, {
        bookingId,
        userId: proposerId,
        role: "proposer",
        confirmationState: CONFIRMATION_STATE.CONFIRMED,
        heldAmount: totalMarks,
      });

      await recordTransition(tx, {
        bookingId,
        fromState: null,
        toState: BOOKING_STATE.AWAITING_TUTOR_REVIEW,
        actorId: proposerId,
        actorType: ACTOR_TYPE.STUDENT,
      });

      await audit.record({
        db: tx,
        actorId: proposerId,
        actorType: ACTOR_TYPE.STUDENT,
        action: "booking_created",
        targetId: bookingId,
        targetType: "booking",
        beforeState: {},
        afterState: { currentState: BOOKING_STATE.AWAITING_TUTOR_REVIEW },
        details: { type: BOOKING_TYPE.SOLO, tutorId: input.tutorId, modality },
      });

      await notification.writeBestEffort({
        db: tx,
        userId: input.tutorId,
        bookingId,
        category: NOTIFICATION_CATEGORY.BOOKING,
        severity: NOTIFICATION_SEVERITY.ACTION,
        title: "New booking request",
        body: "A student has requested a solo session with you.",
        eventKey: `booking.${bookingId}.tutor_request`,
        emailRequired: true,
      });

      // U14 (FR-22/TC-20): an offline booking may carry a room request at
      // creation. When the room is free a `requested` roomBooking row is
      // created in the same transaction; when it is taken the booking still
      // proceeds (awaiting_admin_room_approval) and the response flags the
      // conflict so the UI can suggest alternatives.
      let roomRequested = false;
      let roomConflict = false;
      if (modality === MODALITY.OFFLINE && input.requestedRoomId && roomPort) {
        const request = await roomPort.requestRoomForBooking(tx, {
          bookingId,
          roomId: input.requestedRoomId,
          startAt: input.scheduledStartAt,
          endAt: session.scheduledEndAt,
        });
        roomRequested = request.available;
        roomConflict =
          request.available === false && request.reason === "taken";
      }

      return { ...b, roomRequested, roomConflict };
    });
  }

  /**
   * Cancels a booking, releasing held Marks (late cancellations become LATE_CANCELLED).
   *
   * @param userId - the user cancelling (must have access)
   * @param bookingId - the booking to cancel
   * @param cancellationReason - optional reason for the cancellation
   * @returns the updated booking
   * @throws {BookingStateTransitionError} if the booking is in a terminal state
   */
  async function cancel(
    userId: string,
    bookingId: string,
    cancellationReason?: string,
  ) {
    const result = await db.transaction(async (tx) => {
      const b = await loadBookingAndAssertAccess(tx, userId, bookingId);
      // PRD permissions matrix (prd.tex:350): only the student who created the
      // booking may cancel it. Participants must withdraw; tutors use
      // accept/decline and admin uses overrides.
      if (b.proposerId !== userId) {
        throw new BookingNotOwnedError(bookingId, userId);
      }
      if (TERMINAL_STATES.includes(b.currentState as BookingState)) {
        throw new BookingStateTransitionError(
          b.currentState,
          "cancel",
          b.currentState,
        );
      }

      // M3: once a group series is past participant confirmation, the proposer
      // cannot pull the whole class — the participants' package holds are
      // committed (U4 no-opt-out applies to cancel too, not just withdraw).
      // Admin overrides remain the escape hatch (require admin override
      // otherwise). Cancelling before confirmation is still allowed.
      if (
        b.type === BOOKING_TYPE.SERIES &&
        b.targetGroupSize > 1 &&
        b.currentState !== BOOKING_STATE.AWAITING_PARTICIPANT_CONFIRMATION
      ) {
        throw new BookingSeriesNoOptOutError(bookingId);
      }

      const now = new Date();
      const h2 = new Date(
        b.scheduledStartAt.getTime() - LATE_CANCEL_THRESHOLD_MS,
      );
      const isLate = now > h2;
      // CANCELLED is not reachable from AWAITING_PARTICIPANT_CONFIRMATION /
      // AWAITING_RECONFIRMATION (mirrors withdraw's cancelTarget fallback) —
      // use EXPIRED there so the cancel is never rolled back by the guard.
      const toState: BookingState = canTransition(
        b.currentState as BookingState,
        isLate ? BOOKING_STATE.LATE_CANCELLED : BOOKING_STATE.CANCELLED,
      )
        ? isLate
          ? BOOKING_STATE.LATE_CANCELLED
          : BOOKING_STATE.CANCELLED
        : BOOKING_STATE.EXPIRED;

      if (b.type === BOOKING_TYPE.SERIES) {
        await repo.cancelAllSessions(tx, bookingId);
      }

      if (isLate) {
        // PRD penalty: cancelling after H-2 forfeits the held Marks instead of
        // releasing them.
        const participants = await repo.findConfirmedParticipants(
          tx,
          bookingId,
        );
        for (const p of participants) {
          if (p.heldAmount <= 0) continue;
          // eslint-disable-next-line no-await-in-loop
          const w = await wallet.getByUserId(tx, p.userId);
          if (!w) throw new BookingNotFoundError(p.userId);
          // eslint-disable-next-line no-await-in-loop
          await wallet.deduct(tx, {
            walletId: w.id,
            amount: p.heldAmount,
            eventKey: `booking.${bookingId}.late-cancel.${p.userId}`,
            sourceReference: bookingId,
            bookingId,
            actorType: ACTOR_TYPE.STUDENT,
            reason: "Late cancellation penalty",
          });
          // eslint-disable-next-line no-await-in-loop
          await repo.updateParticipantState(tx, p.id, { heldAmount: 0 });
        }
      } else {
        await releaseAllParticipantHolds(
          tx,
          bookingId,
          `Booking ${toState}: ${cancellationReason ?? "no reason"}`,
          ACTOR_TYPE.STUDENT,
        );
      }

      await repo.updateBookingHoldAmount(tx, bookingId, 0);

      const updated = await transition(tx, bookingId, toState, {
        actorId: userId,
        actorType: ACTOR_TYPE.STUDENT,
        reason: cancellationReason,
      });

      await repo.updateBookingCancellationReason(
        tx,
        bookingId,
        cancellationReason ?? null,
      );

      await notification.writeBestEffort({
        db: tx,
        userId: b.tutorId,
        bookingId,
        category: NOTIFICATION_CATEGORY.BOOKING,
        severity: NOTIFICATION_SEVERITY.ACTION,
        title: `Booking ${toState}`,
        body: `A student has ${toState} the booking.`,
        eventKey: `booking.${bookingId}.${toState}`,
        emailRequired: true,
      });

      if (b.type === BOOKING_TYPE.GROUP || b.type === BOOKING_TYPE.SERIES) {
        const participants = await repo.findConfirmedParticipants(
          tx,
          bookingId,
          userId,
        );
        for (const p of participants) {
          // eslint-disable-next-line no-await-in-loop
          await notification.writeBestEffort({
            db: tx,
            userId: p.userId,
            bookingId,
            category: NOTIFICATION_CATEGORY.BOOKING,
            severity: NOTIFICATION_SEVERITY.ACTION,
            title: `Booking ${toState}`,
            body: `A participant ${toState} the booking.`,
            eventKey: `booking.${bookingId}.${toState}.${p.userId}`,
            emailRequired: true,
          });
        }
      }

      return updated;
    });

    // Delete the provider-side meeting event once the booking is terminal
    // (FR-21/OQ-05). Best-effort: a Google failure must not break cancellation.
    await meeting.cancelEvent(bookingId);

    return result;
  }

  async function tutorAccept(bookingId: string, tutorId: string) {
    const result = await db.transaction(async (tx) => {
      const b = await repo.findBookingById(tx, bookingId);
      if (!b) throw new BookingNotFoundError(bookingId);
      if (b.tutorId !== tutorId)
        throw new BookingNotOwnedError(bookingId, tutorId);
      if (b.currentState !== BOOKING_STATE.AWAITING_TUTOR_REVIEW) {
        throw new BookingNotAwaitingReviewError(bookingId, b.currentState);
      }
      // B4: once the booking deadline passed, the held marks were released —
      // accepting would grant a free session. Mirror the expiry path.
      if (b.deadlineAt && b.deadlineAt.getTime() < Date.now()) {
        throw new BookingAcceptanceDeadlinePassedError(bookingId);
      }

      const isOffline = b.modality === MODALITY.OFFLINE;

      let updated;
      if (!isOffline) {
        await transition(tx, bookingId, BOOKING_STATE.CONFIRMED, {
          actorId: tutorId,
          actorType: ACTOR_TYPE.TUTOR,
        });

        try {
          const finalize = await finalizeMeetingSchedule(tx, b, tutorId);
          updated = finalize.booking;
        } catch (error) {
          log({
            level: "error",
            action: "tutor_accept_meeting_failed",
            message:
              "Meeting creation or scheduled transition failed after tutor accept; booking left CONFIRMED without a meeting link",
            error: { message: String(error) },
            bookingId,
            tutorId,
          });
          updated = await repo.findBookingById(tx, bookingId);
        }
      } else {
        await transition(tx, bookingId, BOOKING_STATE.CONFIRMED, {
          actorId: tutorId,
          actorType: ACTOR_TYPE.TUTOR,
        });

        await transition(
          tx,
          bookingId,
          BOOKING_STATE.AWAITING_ADMIN_ROOM_APPROVAL,
          {
            actorId: tutorId,
            actorType: ACTOR_TYPE.TUTOR,
            reason: "Offline booking requires room assignment",
          },
        );

        // DL-25 (U12): the offline room-approval window is 12 hours, capped
        // at session start when the session starts sooner.
        const approvalDeadline = new Date(
          Math.min(
            Date.now() + RESPONSE_WINDOW_MS,
            b.scheduledStartAt.getTime(),
          ),
        );
        await repo.updateBookingDeadline(tx, bookingId, approvalDeadline);
        updated = await repo.findBookingById(tx, bookingId);
      }

      await notification.write({
        db: tx,
        userId: b.proposerId,
        bookingId,
        category: NOTIFICATION_CATEGORY.BOOKING,
        severity: NOTIFICATION_SEVERITY.ACTION,
        title: "Booking accepted",
        body: isOffline
          ? "Tutor accepted. Waiting for admin room approval."
          : "Tutor accepted. Session scheduled.",
        eventKey: `booking.${bookingId}.accepted`,
        emailRequired: true,
      });

      return { updated, isOffline, b };
    });

    return result.updated!;
  }

  async function tutorDecline(
    bookingId: string,
    tutorId: string,
    reason?: string,
  ) {
    const result = await db.transaction(async (tx) => {
      const b = await repo.findBookingById(tx, bookingId);
      if (!b) throw new BookingNotFoundError(bookingId);
      if (b.tutorId !== tutorId)
        throw new BookingNotOwnedError(bookingId, tutorId);
      if (b.currentState !== BOOKING_STATE.AWAITING_TUTOR_REVIEW) {
        throw new BookingNotAwaitingReviewError(bookingId, b.currentState);
      }

      await releaseAllParticipantHolds(
        tx,
        bookingId,
        reason ?? "Tutor declined",
        ACTOR_TYPE.TUTOR,
      );

      await repo.updateBookingHoldAmount(tx, bookingId, 0);

      const updated = await transition(tx, bookingId, BOOKING_STATE.DECLINED, {
        actorId: tutorId,
        actorType: ACTOR_TYPE.TUTOR,
        reason,
      });

      await notification.writeBestEffort({
        db: tx,
        userId: b.proposerId,
        bookingId,
        category: NOTIFICATION_CATEGORY.BOOKING,
        severity: NOTIFICATION_SEVERITY.ACTION,
        title: "Booking declined",
        body: `Tutor declined the booking. ${escapeHtml(reason ?? "")}`,
        eventKey: `booking.${bookingId}.declined`,
        emailRequired: true,
      });

      return updated;
    });

    // Best-effort cleanup of the provider-side event (a declined booking may
    // have a live meeting if it was previously scheduled).
    await meeting.cancelEvent(bookingId);

    return result;
  }

  async function completeSession(
    bookingId: string,
    tutorId: string,
    sessionId?: string,
  ) {
    return db.transaction(async (tx) => {
      const b = await repo.findBookingById(tx, bookingId);
      if (!b) throw new BookingNotFoundError(bookingId);
      if (b.tutorId !== tutorId)
        throw new BookingNotOwnedError(bookingId, tutorId);

      if (b.type !== BOOKING_TYPE.SERIES) {
        return completeSingleSession(tx, b, bookingId, tutorId);
      }

      return completeSeriesSession(tx, b, bookingId, tutorId, sessionId);
    });
  }

  async function completeSingleSession(
    tx: DbOrTx,
    b: BookingRow,
    bookingId: string,
    tutorId: string,
  ) {
    if (b.currentState !== BOOKING_STATE.SCHEDULED) {
      throw new BookingStateTransitionError(
        b.currentState,
        "complete",
        BOOKING_STATE.COMPLETED,
      );
    }

    if (b.scheduledStartAt.getTime() > Date.now()) {
      throw new BookingSessionNotStartedError(bookingId);
    }

    if (b.type === BOOKING_TYPE.GROUP) {
      // After a group repricing the holds live on each remaining
      // participant's wallet (the proposer may have withdrawn and hold 0),
      // so deduct from each confirmed participant individually.
      const participants = await repo.findConfirmedParticipants(tx, bookingId);
      for (const p of participants) {
        if (p.heldAmount <= 0) continue;
        // eslint-disable-next-line no-await-in-loop
        const w = await wallet.getByUserId(tx, p.userId);
        if (!w) throw new BookingNotFoundError(p.userId);
        // eslint-disable-next-line no-await-in-loop
        await wallet.deduct(tx, {
          walletId: w.id,
          amount: p.heldAmount,
          eventKey: `booking.${bookingId}.complete.${p.userId}`,
          sourceReference: bookingId,
          bookingId,
          actorType: ACTOR_TYPE.TUTOR,
          reason: "Session completed",
        });
      }
    } else {
      const proposerWallet = await wallet.getByUserId(tx, b.proposerId);
      if (!proposerWallet) throw new BookingNotFoundError(b.proposerId);
      await wallet.deduct(tx, {
        walletId: proposerWallet.id,
        amount: b.holdAmount,
        eventKey: `booking.${bookingId}.deduct`,
        sourceReference: bookingId,
        bookingId,
        actorType: ACTOR_TYPE.TUTOR,
        reason: "Session completed",
      });
    }

    const updated = await transition(tx, bookingId, BOOKING_STATE.COMPLETED, {
      actorId: tutorId,
      actorType: ACTOR_TYPE.TUTOR,
    });

    await repo.updateBookingHoldAmount(tx, bookingId, 0);

    await notification.writeBestEffort({
      db: tx,
      userId: b.proposerId,
      bookingId,
      category: NOTIFICATION_CATEGORY.BOOKING,
      severity: NOTIFICATION_SEVERITY.INFO,
      title: "Session completed",
      body: "Tutor marked the session as completed. Marks deducted.",
      eventKey: `booking.${bookingId}.completed`,
    });

    return updated;
  }

  async function completeSeriesSession(
    tx: DbOrTx,
    b: BookingRow,
    bookingId: string,
    tutorId: string,
    sessionId?: string,
  ) {
    if (b.currentState !== BOOKING_STATE.SCHEDULED) {
      throw new BookingStateTransitionError(
        b.currentState,
        "complete",
        BOOKING_STATE.COMPLETED,
      );
    }
    if (!sessionId) throw new BookingSessionRequiredError(bookingId);

    const session = await repo.findSessionById(tx, sessionId);
    if (!session || session.seriesBookingId !== bookingId) {
      throw new BookingSessionNotFoundError(sessionId);
    }
    if (session.currentState !== BOOKING_STATE.SCHEDULED) {
      throw new BookingStateTransitionError(
        session.currentState,
        "completeSession",
        BOOKING_STATE.COMPLETED,
      );
    }
    if (session.scheduledStartAt.getTime() > Date.now()) {
      throw new BookingSessionNotStartedError(sessionId);
    }

    const isGroupSeries = b.targetGroupSize > 1;
    let deductedHoldAmount = 0;
    let residualHeld = 0;
    let proposerWallet: Awaited<ReturnType<BookingWalletPort["getByUserId"]>> =
      null;
    let proposerParticipant: NonNullable<
      Awaited<ReturnType<BookingRepo["findParticipant"]>>
    > | null = null;

    if (isGroupSeries) {
      // P1-8: group-series holds live on each confirmed participant's wallet,
      // so a completed session deducts each participant's per-session share.
      const participants = await repo.findConfirmedParticipants(tx, bookingId);
      for (const p of participants) {
        if (p.heldAmount <= 0) continue;
        // eslint-disable-next-line no-await-in-loop
        const w = await wallet.getByUserId(tx, p.userId);
        if (!w) throw new BookingNotFoundError(p.userId);
        // L1: after an admin cancelSeriesSession(..., release) the remaining
        // held amount may be below session.holdAmount — never deduct more than
        // the participant actually holds (InsufficientBalanceError → a
        // delivered-but-unpaid session).
        const deductAmount = Math.min(session.holdAmount, p.heldAmount);
        // eslint-disable-next-line no-await-in-loop
        await wallet.deduct(tx, {
          walletId: w.id,
          amount: deductAmount,
          eventKey: `booking.${bookingId}.session.${session.id}.deduct.${p.userId}`,
          sourceReference: bookingId,
          bookingId,
          actorType: ACTOR_TYPE.TUTOR,
          reason: "Group series session completed",
        });
        // eslint-disable-next-line no-await-in-loop
        await repo.updateParticipantState(tx, p.id, {
          heldAmount: Math.max(0, p.heldAmount - deductAmount),
        });
        deductedHoldAmount += deductAmount;
      }
    } else {
      proposerWallet = await wallet.getByUserId(tx, b.proposerId);
      if (!proposerWallet) throw new BookingNotFoundError(b.proposerId);
      proposerParticipant = await repo.findParticipant(
        tx,
        bookingId,
        b.proposerId,
      );
      // L1: after an admin cancelSeriesSession(..., release) the remaining
      // held amount may be below the per-session amount — never deduct more
      // than the participant actually holds (InsufficientBalanceError → a
      // delivered-but-unpaid session).
      const deductAmount = Math.min(
        session.holdAmount,
        proposerParticipant?.heldAmount ?? proposerWallet.heldBalance,
      );
      await wallet.deduct(tx, {
        walletId: proposerWallet.id,
        amount: deductAmount,
        eventKey: `booking.${bookingId}.session.${session.id}.deduct`,
        sourceReference: bookingId,
        bookingId,
        actorType: ACTOR_TYPE.TUTOR,
        reason: "Series session completed",
      });

      if (proposerParticipant) {
        residualHeld = Math.max(
          0,
          proposerParticipant.heldAmount - deductAmount,
        );
        await repo.updateParticipantState(tx, proposerParticipant.id, {
          heldAmount: residualHeld,
        });
      }
      deductedHoldAmount = deductAmount;
    }
    await repo.updateBookingHoldAmount(
      tx,
      bookingId,
      Math.max(0, b.holdAmount - deductedHoldAmount),
    );

    await repo.completeSession(tx, session.id);

    await notification.writeBestEffort({
      db: tx,
      userId: b.proposerId,
      bookingId,
      category: NOTIFICATION_CATEGORY.BOOKING,
      severity: NOTIFICATION_SEVERITY.INFO,
      title: "Session completed",
      body: "One session of your series was marked as completed.",
      eventKey: `booking.${bookingId}.session.${session.id}.completed.student`,
    });
    await notification.writeBestEffort({
      db: tx,
      userId: b.tutorId,
      bookingId,
      category: NOTIFICATION_CATEGORY.BOOKING,
      severity: NOTIFICATION_SEVERITY.INFO,
      title: "Session completed",
      body: "One session of the series was marked as completed.",
      eventKey: `booking.${bookingId}.session.${session.id}.completed.tutor`,
    });

    const sessions = await repo.listSessionsBySeriesId(tx, bookingId);
    const allCompleted = sessions.every(
      (s) => s.currentState === BOOKING_STATE.COMPLETED,
    );
    if (!allCompleted) {
      const refreshed = await repo.findBookingById(tx, bookingId);
      if (!refreshed) throw new BookingNotFoundError(bookingId);
      return refreshed;
    }

    if (isGroupSeries) {
      // Release any residual hold each participant still carries (normally 0
      // after per-session deducts, but guard rounding/edge states).
      const participants = await repo.findConfirmedParticipants(tx, bookingId);
      for (const p of participants) {
        if (p.heldAmount <= 0) continue;
        // eslint-disable-next-line no-await-in-loop
        const w = await wallet.getByUserId(tx, p.userId);
        if (!w) throw new BookingNotFoundError(p.userId);
        // eslint-disable-next-line no-await-in-loop
        await wallet.release(tx, {
          walletId: w.id,
          amount: p.heldAmount,
          eventKey: `booking.${bookingId}.series-release.${p.userId}`,
          sourceReference: bookingId,
          bookingId,
          actorType: ACTOR_TYPE.TUTOR,
          reason: "Group series completed: released residual hold",
        });
        // eslint-disable-next-line no-await-in-loop
        await repo.updateParticipantState(tx, p.id, { heldAmount: 0 });
      }
    } else if (residualHeld > 0) {
      await wallet.release(tx, {
        walletId: proposerWallet!.id,
        amount: residualHeld,
        eventKey: `booking.${bookingId}.series-release`,
        sourceReference: bookingId,
        bookingId,
        actorType: ACTOR_TYPE.TUTOR,
        reason: "Series completed: released residual hold",
      });
      await repo.updateParticipantState(tx, proposerParticipant!.id, {
        heldAmount: 0,
      });
    }

    await repo.updateBookingHoldAmount(tx, bookingId, 0);
    await transition(tx, bookingId, BOOKING_STATE.COMPLETED, {
      actorId: tutorId,
      actorType: ACTOR_TYPE.TUTOR,
      reason: "All series sessions completed",
    });

    await notification.writeBestEffort({
      db: tx,
      userId: b.proposerId,
      bookingId,
      category: NOTIFICATION_CATEGORY.BOOKING,
      severity: NOTIFICATION_SEVERITY.INFO,
      title: "Series completed",
      body: "All sessions in your series are completed. Remaining holds released.",
      eventKey: `booking.${bookingId}.series_completed.student`,
    });
    await notification.writeBestEffort({
      db: tx,
      userId: b.tutorId,
      bookingId,
      category: NOTIFICATION_CATEGORY.BOOKING,
      severity: NOTIFICATION_SEVERITY.INFO,
      title: "Series completed",
      body: "All sessions in the series are completed.",
      eventKey: `booking.${bookingId}.series_completed.tutor`,
    });

    const refreshed = await repo.findBookingById(tx, bookingId);
    if (!refreshed) throw new BookingNotFoundError(bookingId);
    return refreshed;
  }

  async function cancelSession(userId: string, sessionId: string) {
    return db.transaction(async (tx) => {
      const session = await repo.findSessionById(tx, sessionId);
      if (!session) throw new BookingSessionNotFoundError(sessionId);
      const b = await repo.findBookingById(tx, session.seriesBookingId);
      if (!b) throw new BookingNotFoundError(session.seriesBookingId);
      await assertBookingAccess(b, userId, tx, session.seriesBookingId);
      // PRD (prd.tex:887): only the student may cancel an individual future
      // series session; a tutor cannot skip the wallet release path.
      if (b.proposerId !== userId) {
        throw new BookingNotOwnedError(session.seriesBookingId, userId);
      }

      if (TERMINAL_STATES.includes(b.currentState as BookingState)) {
        throw new BookingCancelledError(session.seriesBookingId);
      }

      if (b.type !== BOOKING_TYPE.SERIES) {
        throw new BookingNotEditableError(session.seriesBookingId);
      }
      if (b.targetGroupSize > 1) {
        throw new BookingSessionNotCancellableError(sessionId);
      }
      if (session.currentState !== BOOKING_STATE.SCHEDULED) {
        throw new BookingStateTransitionError(
          session.currentState,
          "cancelSession",
          BOOKING_STATE.CANCELLED,
        );
      }

      const now = new Date();
      const h2 = new Date(
        session.scheduledStartAt.getTime() - LATE_CANCEL_THRESHOLD_MS,
      );
      const isLate = now > h2;

      const participant = await repo.findParticipant(tx, b.id, userId);
      // M4: cap the release/deduct at the participant's current held amount.
      // After an admin cancelSeriesSession(..., release) the participant may
      // hold less than session.holdAmount; releasing/deducting the full
      // session amount would draw the difference from the wallet's pooled
      // held balance (other bookings' holds) and strand later completions.
      const effective = Math.min(
        session.holdAmount,
        participant?.heldAmount ?? session.holdAmount,
      );
      if (participant && effective > 0) {
        const w = await wallet.getByUserId(tx, participant.userId);
        if (!w) throw new BookingNotFoundError(participant.userId);
        if (isLate) {
          // PRD penalty (TC-30): cancelling after H-2 forfeits the session
          // hold instead of releasing it.
          await wallet.deduct(tx, {
            walletId: w.id,
            amount: effective,
            eventKey: `booking.${b.id}.session.${session.id}.forfeit`,
            sourceReference: b.id,
            bookingId: b.id,
            actorType: ACTOR_TYPE.STUDENT,
            reason: "Session cancelled after cancellation deadline (forfeit)",
          });
        } else {
          await wallet.release(tx, {
            walletId: w.id,
            amount: effective,
            eventKey: `booking.${b.id}.session.${session.id}.cancel`,
            sourceReference: b.id,
            bookingId: b.id,
            actorType: ACTOR_TYPE.STUDENT,
            reason: "Series session cancelled",
          });
        }
        await repo.updateParticipantState(tx, participant.id, {
          heldAmount: Math.max(0, participant.heldAmount - effective),
        });
      }

      await repo.cancelSession(tx, session.id);
      await repo.updateBookingHoldAmount(
        tx,
        b.id,
        Math.max(0, b.holdAmount - effective),
      );

      await notification.writeBestEffort({
        db: tx,
        userId: b.tutorId,
        bookingId: b.id,
        category: NOTIFICATION_CATEGORY.BOOKING,
        severity: NOTIFICATION_SEVERITY.INFO,
        title: "Series session cancelled",
        body: isLate
          ? "A student cancelled one session of the series after the cancellation deadline (hold forfeited)."
          : "A student cancelled one session of the series.",
        eventKey: `booking.${b.id}.session.${session.id}.cancelled`,
      });

      return { cancelled: true, sessionId, forfeited: isLate };
    });
  }

  async function addSessionNote(
    userId: string,
    bookingId: string,
    content: string,
  ) {
    const b = await repo.findBookingById(db, bookingId);
    if (!b) throw new BookingNotFoundError(bookingId);
    await assertBookingAccess(b, userId, db, bookingId);
    if (b.currentState !== BOOKING_STATE.COMPLETED) {
      throw new BookingNotCompletedError(bookingId);
    }
    const sanitized = sanitizeHtml(content).trim();
    if (!sanitized) throw new BookingNotEditableError(bookingId);
    return repo.insertSessionNote(db, {
      bookingId,
      authorId: userId,
      content: sanitized,
    });
  }

  async function getSessionNotes(userId: string, bookingId: string) {
    const b = await repo.findBookingById(db, bookingId);
    if (!b) throw new BookingNotFoundError(bookingId);
    await assertBookingAccess(b, userId, db, bookingId);
    if (b.currentState !== BOOKING_STATE.COMPLETED) {
      throw new BookingNotCompletedError(bookingId);
    }
    return repo.listSessionNotes(db, bookingId);
  }

  /**
   * Marks a participant as no-show for a session (U5 / FR-20 TC-30). Only
   * after `scheduledStartAt + 15min` and before the session is completed.
   * Forfeits the participant's (per-session) hold via the same ledger path as
   * the late-cancel penalty and notifies the participant. A solo booking is
   * transitioned to NO_SHOW; a series session keeps its state so other
   * participants are unaffected.
   */
  async function markParticipantNoShow(
    bookingId: string,
    tutorId: string,
    participantUserId: string,
    sessionId?: string,
  ) {
    return db.transaction(async (tx) => {
      const b = await repo.findBookingById(tx, bookingId);
      if (!b) throw new BookingNotFoundError(bookingId);
      if (b.tutorId !== tutorId)
        throw new BookingNotOwnedError(bookingId, tutorId);

      const participant = await repo.findParticipant(
        tx,
        bookingId,
        participantUserId,
      );
      if (!participant)
        throw new BookingParticipantNotFoundError(participantUserId);

      const isSeries = b.type === BOOKING_TYPE.SERIES;
      const session = isSeries
        ? sessionId
          ? await repo.findSessionById(tx, sessionId)
          : null
        : null;
      if (isSeries && !session)
        throw new BookingSessionNotFoundError(sessionId ?? "");

      const sessionStartAt = session?.scheduledStartAt ?? b.scheduledStartAt;
      const now = new Date();
      if (now.getTime() < sessionStartAt.getTime() + LATENESS_TOLERANCE_MS) {
        throw new BookingNotEditableError(
          "No-show can only be marked 15 minutes after the session starts",
        );
      }

      const sessionState = session?.currentState ?? b.currentState;
      if (sessionState !== BOOKING_STATE.SCHEDULED) {
        throw new BookingStateTransitionError(
          sessionState,
          "mark_no_show",
          BOOKING_STATE.NO_SHOW,
        );
      }

      const forfeitAmount = isSeries
        ? Math.min(session!.holdAmount, participant.heldAmount)
        : participant.heldAmount;
      if (forfeitAmount > 0) {
        const w = await wallet.getByUserId(tx, participantUserId);
        if (!w) throw new BookingNotFoundError(participantUserId);
        await wallet.deduct(tx, {
          walletId: w.id,
          amount: forfeitAmount,
          eventKey: `booking.${bookingId}.no_show.${participantUserId}.${sessionId ?? "solo"}`,
          sourceReference: bookingId,
          bookingId,
          actorType: ACTOR_TYPE.TUTOR,
          reason: "Marked as no-show",
        });
      }

      const isGroup = b.type === BOOKING_TYPE.GROUP;
      // The forfeited hold no longer lives in the wallet: zero the target's
      // row (group) so a later release never double-credits them. For a
      // series, the participant still holds the remaining sessions' marks, so
      // decrement `heldAmount` by the forfeit (H2) — otherwise a later
      // completion deduct / residual release draws from the pooled wallet hold
      // and throws InsufficientBalanceError (delivered-but-unpaid session).
      await repo.updateParticipantState(tx, participant.id, {
        attendanceState: ATTENDANCE_STATE.ABSENT,
        ...(isGroup
          ? { heldAmount: 0 }
          : isSeries
            ? {
                heldAmount: Math.max(0, participant.heldAmount - forfeitAmount),
              }
            : {}),
      });

      if (isGroup) {
        // Group (non-series): only the target participant's hold is forfeited
        // (deducted above); the booking stays live and the other confirmed
        // participants' holds are preserved. Recompute the booking hold as the
        // sum of the remaining confirmed (non-ABSENT) participants' held
        // amounts — mirroring the group branches in completeSingleSession.
        const confirmed = await repo.findConfirmedParticipants(tx, bookingId);
        const holdAmount = confirmed
          .filter((p) => p.attendanceState !== ATTENDANCE_STATE.ABSENT)
          .reduce((sum, p) => sum + p.heldAmount, 0);
        await repo.updateBookingHoldAmount(tx, bookingId, holdAmount);
      } else if (isSeries) {
        // Series: recompute the booking hold to match the participant's
        // reduced held amount so later completions deduct the correct total.
        const participants = await repo.findConfirmedParticipants(
          tx,
          bookingId,
        );
        const holdAmount = participants.reduce(
          (sum, p) => sum + p.heldAmount,
          0,
        );
        await repo.updateBookingHoldAmount(tx, bookingId, holdAmount);
      } else if (!isSeries) {
        await repo.updateBookingHoldAmount(tx, bookingId, 0);
        await transition(tx, bookingId, BOOKING_STATE.NO_SHOW, {
          actorId: tutorId,
          actorType: ACTOR_TYPE.TUTOR,
          reason: "Participant marked as no-show",
        });
      }

      await notification.writeBestEffort({
        db: tx,
        userId: participantUserId,
        bookingId,
        category: NOTIFICATION_CATEGORY.BOOKING,
        severity: NOTIFICATION_SEVERITY.ACTION,
        title: "Session marked as no-show",
        body: "You were marked as a no-show for this session and the held marks were forfeited.",
        eventKey: `booking.${bookingId}.no_show.notify.${participantUserId}.${sessionId ?? "solo"}`,
        emailRequired: true,
      });

      return {
        bookingId,
        participantUserId,
        sessionId: sessionId ?? null,
        forfeitedMarks: forfeitAmount,
      };
    });
  }

  async function markTutorAttendance(
    bookingId: string,
    tutorId: string,
    attendance: "present" | "late",
  ) {
    return db.transaction(async (tx) => {
      const b = await repo.findBookingById(tx, bookingId);
      if (!b) throw new BookingNotFoundError(bookingId);
      if (b.tutorId !== tutorId)
        throw new BookingNotOwnedError(bookingId, tutorId);
      if (b.currentState !== BOOKING_STATE.SCHEDULED) {
        throw new BookingStateTransitionError(
          b.currentState,
          "mark_attendance",
          BOOKING_STATE.SCHEDULED,
        );
      }

      // Attendance may only be marked within the lateness tolerance of the
      // scheduled start (bug H2a): a tutor can no longer pre-mark "present"
      // days early to dodge the lateness check.
      const now = Date.now();
      const windowStart = b.scheduledStartAt.getTime() - LATENESS_TOLERANCE_MS;
      const windowEnd = b.scheduledStartAt.getTime() + LATENESS_TOLERANCE_MS;
      if (now < windowStart || now > windowEnd) {
        throw new BookingNotEditableError(
          "Tutor attendance can only be marked within 15 minutes of the session start",
        );
      }

      const tutorParticipant = await repo.findTutorParticipant(tx, bookingId);
      if (tutorParticipant) {
        await repo.updateParticipantState(tx, tutorParticipant.id, {
          attendanceState: attendance,
        });
      } else {
        await repo.insertParticipant(tx, {
          bookingId,
          userId: b.tutorId,
          role: "tutor",
          confirmationState: CONFIRMATION_STATE.CONFIRMED,
          heldAmount: 0,
          attendanceState: attendance,
        });
      }

      return { bookingId, attendanceState: attendance };
    });
  }

  async function proposeReschedule(
    userId: string,
    bookingId: string,
    proposedStartAt: Date,
    _proposedEndAt: Date,
    reason?: string,
    availabilitySlotId?: string,
    sessionId?: string,
  ) {
    return db.transaction(async (tx) => {
      const b = await loadBookingAndAssertAccess(tx, userId, bookingId);
      if (b.tutorId !== userId && b.proposerId !== userId)
        throw new BookingNotOwnedError(bookingId, userId);
      if (TERMINAL_STATES.includes(b.currentState as BookingState)) {
        throw new BookingStateTransitionError(
          b.currentState,
          "reschedule",
          BOOKING_STATE.RESCHEDULE_PROPOSED,
        );
      }

      const session = normalizeSession(proposedStartAt);
      if (userId !== b.tutorId) {
        // C2: the current session must also still be beyond H-2 — a student
        // close to class cannot bypass the late-cancel penalty by proposing a
        // reschedule to a slot ≥2h out (mirror the cancel() guard).
        if (
          b.scheduledStartAt.getTime() - Date.now() <=
          LATE_CANCEL_THRESHOLD_MS
        ) {
          throw new BookingNotEditableError(
            "Booking can no longer be rescheduled within 2 hours of the current session (H-2)",
          );
        }
        // U2 (FR-14 TC-15): student-initiated reschedules are only allowed
        // before H-2 — the new session must start at least 2 hours out.
        if (
          session.scheduledStartAt.getTime() <
          Date.now() + LATE_CANCEL_THRESHOLD_MS
        ) {
          throw new BookingNotEditableError(
            "Reschedule must be at least 2 hours before the new session start (H-2)",
          );
        }
        const slot = availabilitySlotId
          ? await repo.findAvailabilitySlot(tx, availabilitySlotId, b.tutorId)
          : await repo.findAvailabilityWindowContaining(
              tx,
              b.tutorId,
              session.scheduledStartAt,
              session.scheduledEndAt,
            );
        if (!slot)
          throw new BookingNotEditableError(
            "No tutor availability covers this session",
          );
        assertSessionFitsAvailability(
          slot,
          session,
          b.modality as "online" | "offline",
        );
      }
      if (sessionId) {
        const existingSession = await repo.findSessionById(tx, sessionId);
        if (!existingSession || existingSession.seriesBookingId !== bookingId) {
          throw new BookingSessionNotFoundError(sessionId);
        }
        // U7: the booking-level overlap check cannot see sibling series
        // sessions — check them explicitly so a session cannot be moved onto
        // another session of the same series.
        const siblings = await repo.listSessionsBySeriesId(tx, bookingId);
        const overlappingSibling = siblings.find(
          (sib) =>
            sib.id !== sessionId &&
            sib.currentState === BOOKING_STATE.SCHEDULED &&
            sib.scheduledStartAt < session.scheduledEndAt &&
            sib.scheduledEndAt > session.scheduledStartAt,
        );
        if (overlappingSibling) {
          throw new BookingConflictError(
            b.tutorId,
            session.scheduledStartAt.toISOString(),
            session.scheduledEndAt.toISOString(),
          );
        }
      }
      const overlapping = await repo.findOverlappingBookings(
        tx,
        b.tutorId,
        session.scheduledStartAt,
        session.scheduledEndAt,
        { excludeBookingId: bookingId, excludeStates: [...TERMINAL_STATES] },
      );
      if (overlapping.length) {
        throw new BookingConflictError(
          b.tutorId,
          session.scheduledStartAt.toISOString(),
          session.scheduledEndAt.toISOString(),
        );
      }

      const pending = await repo.findPendingRescheduleProposal(tx, bookingId);
      if (pending) {
        await repo.updateRescheduleProposal(tx, pending.id, {
          status: "superseded",
          decidedAt: new Date(),
        });
      }

      const updated =
        b.currentState === BOOKING_STATE.RESCHEDULE_PROPOSED
          ? b
          : await transition(tx, bookingId, BOOKING_STATE.RESCHEDULE_PROPOSED, {
              actorId: userId,
              actorType:
                userId === b.tutorId ? ACTOR_TYPE.TUTOR : ACTOR_TYPE.STUDENT,
              reason,
              metadata: { proposedStartAt: session.scheduledStartAt },
            });

      const participants = await repo.findConfirmedParticipants(tx, bookingId);
      const voters = new Set([
        b.tutorId,
        b.proposerId,
        ...participants.map((p) => p.userId),
      ]);
      const decisions = Object.fromEntries(
        [...voters].map((id) => [id, id === userId ? "accepted" : "pending"]),
      ) as Record<string, "pending" | "accepted" | "rejected">;

      await repo.insertRescheduleProposal(tx, {
        bookingId,
        sessionId,
        proposedBy: userId,
        proposedStartAt: session.scheduledStartAt,
        proposedEndAt: session.scheduledEndAt,
        reason,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        decisions,
        status: CONFIRMATION_STATE.PENDING,
      });

      await repo.updateBookingDeadline(
        tx,
        bookingId,
        new Date(Date.now() + 24 * 60 * 60 * 1000),
      );

      for (const recipientId of [...voters].filter((id) => id !== userId)) {
        await notification.write({
          db: tx,
          userId: recipientId,
          bookingId,
          category: NOTIFICATION_CATEGORY.BOOKING,
          severity: NOTIFICATION_SEVERITY.ACTION,
          title: "Reschedule proposed",
          body: "A new time was proposed for the booking.",
          eventKey: `booking.${bookingId}.reschedule_proposed`,
          emailRequired: true,
        });
      }

      return updated;
    });
  }

  async function acceptReschedule(
    userId: string,
    bookingId: string,
    proposalId?: string,
  ) {
    const { proposal, updated, finalized } = await db.transaction(
      async (tx) => {
        const b = await repo.findBookingById(tx, bookingId);
        if (!b) throw new BookingNotFoundError(bookingId);
        await assertBookingAccess(b, userId, tx, bookingId);
        if (b.currentState !== BOOKING_STATE.RESCHEDULE_PROPOSED) {
          throw new BookingRescheduleNotPendingError(bookingId);
        }

        const pending = await repo.findPendingRescheduleProposal(tx, bookingId);
        if (!pending) throw new BookingRescheduleNotFoundError(bookingId);
        if (proposalId && pending.id !== proposalId) {
          throw new BookingRescheduleNotFoundError(bookingId);
        }

        const currentDecisions = pending.decisions ?? {
          [b.tutorId]: "accepted",
          [b.proposerId]: "pending",
        };
        if (!(userId in currentDecisions)) {
          throw new BookingNotOwnedError(bookingId, userId);
        }
        const decisions = {
          ...currentDecisions,
          [userId]: "accepted" as const,
        };
        const allAccepted = Object.values(decisions).every(
          (decision) => decision === "accepted",
        );

        await repo.updateRescheduleProposal(tx, pending.id, {
          decisions,
          status: allAccepted ? "accepted" : "pending",
          decidedAt: allAccepted ? new Date() : undefined,
        });

        if (!allAccepted) {
          return { proposal: pending, updated: b, finalized: false };
        }

        if (pending.sessionId) {
          await repo.updateSessionSchedule(tx, pending.sessionId, {
            scheduledStartAt: pending.proposedStartAt,
            scheduledEndAt: pending.proposedEndAt,
          });
        } else {
          await repo.updateBookingSchedule(tx, bookingId, {
            scheduledStartAt: pending.proposedStartAt,
            scheduledEndAt: pending.proposedEndAt,
          });
        }

        const targetState =
          (b.previousState as BookingState | null) ??
          BOOKING_STATE.AWAITING_TUTOR_REVIEW;
        const transitioned = await transition(tx, bookingId, targetState, {
          actorId: userId,
          actorType:
            userId === b.tutorId ? ACTOR_TYPE.TUTOR : ACTOR_TYPE.STUDENT,
          reason: "All required parties accepted the reschedule proposal",
          metadata: {
            proposedStartAt: pending.proposedStartAt,
            proposedEndAt: pending.proposedEndAt,
          },
        });

        if (targetState === BOOKING_STATE.AWAITING_TUTOR_REVIEW) {
          await repo.updateBookingDeadline(
            tx,
            bookingId,
            new Date(Date.now() + RESPONSE_WINDOW_MS),
          );
        } else if (targetState === BOOKING_STATE.SCHEDULED) {
          // H1: an accepted reschedule moves the session to the proposal's new
          // times — refresh the deadline from the NEW session end (mirror
          // finalizeMeetingSchedule / transitionBookingToScheduled) so the
          // booking is not auto-expired at the proposal's now+24h.
          await repo.updateBookingDeadline(
            tx,
            bookingId,
            new Date(
              pending.proposedEndAt.getTime() +
                (b.modality === MODALITY.OFFLINE
                  ? OFFLINE_SCHEDULED_GRACE_MS
                  : 24 * 60 * 60 * 1000),
            ),
          );
        } else if (targetState === BOOKING_STATE.AWAITING_ADMIN_ROOM_APPROVAL) {
          // Mirror the offline room-approval window (DL-25/U12): 12h, capped at
          // the (new) session start.
          await repo.updateBookingDeadline(
            tx,
            bookingId,
            new Date(
              Math.min(
                Date.now() + RESPONSE_WINDOW_MS,
                pending.proposedStartAt.getTime(),
              ),
            ),
          );
        }

        for (const recipientId of Object.keys(decisions).filter(
          (id) => id !== userId,
        )) {
          await notification.write({
            db: tx,
            userId: recipientId,
            bookingId,
            category: NOTIFICATION_CATEGORY.BOOKING,
            severity: NOTIFICATION_SEVERITY.ACTION,
            title: "Reschedule accepted",
            body: "Every required party accepted the proposed new time.",
            eventKey: `booking.${bookingId}.reschedule_accepted`,
            emailRequired: true,
          });
        }

        return { proposal: pending, updated: transitioned, finalized: true };
      },
    );

    // Move the provider-side meeting event to the new time (FR-21/OQ-05).
    // Best-effort: a Google failure must not roll back the accepted reschedule.
    if (finalized) {
      await meeting.updateEvent(bookingId, {
        startAt: proposal.proposedStartAt,
        endAt: proposal.proposedEndAt,
      });
    }

    return updated;
  }

  async function rejectReschedule(
    userId: string,
    bookingId: string,
    proposalId?: string,
  ) {
    return db.transaction(async (tx) => {
      const b = await repo.findBookingById(tx, bookingId);
      if (!b) throw new BookingNotFoundError(bookingId);
      await assertBookingAccess(b, userId, tx, bookingId);
      if (b.currentState !== BOOKING_STATE.RESCHEDULE_PROPOSED) {
        throw new BookingRescheduleNotPendingError(bookingId);
      }

      const proposal = await repo.findPendingRescheduleProposal(tx, bookingId);
      if (!proposal) throw new BookingRescheduleNotFoundError(bookingId);
      if (proposalId && proposal.id !== proposalId) {
        throw new BookingRescheduleNotFoundError(bookingId);
      }

      const currentDecisions = proposal.decisions ?? {
        [b.tutorId]: "accepted",
        [b.proposerId]: "pending",
      };
      if (!(userId in currentDecisions)) {
        throw new BookingNotOwnedError(bookingId, userId);
      }

      await repo.updateRescheduleProposal(tx, proposal.id, {
        status: "rejected",
        decidedAt: new Date(),
        decisions: { ...currentDecisions, [userId]: "rejected" },
      });

      // The only legal states a booking can enter reschedule_proposed from are
      // the sources in the transitions table, so derive the revert set from it
      // to guarantee the booking returns to its exact prior state.
      const rescheduleSources = (
        Object.entries(TRANSITIONS) as [BookingState, { to: BookingState[] }][]
      )
        .filter(([, t]) => t.to.includes(BOOKING_STATE.RESCHEDULE_PROPOSED))
        .map(([state]) => state);
      const previous = b.previousState as BookingState | null;
      const revertTarget =
        previous && rescheduleSources.includes(previous)
          ? previous
          : // Unreachable given the current transitions table; kept as a
            // defensive fallback if a future legal source is added without a
            // matching revert target.
            BOOKING_STATE.AWAITING_RECONFIRMATION;

      const updated = await transition(tx, bookingId, revertTarget, {
        actorId: userId,
        actorType: userId === b.tutorId ? ACTOR_TYPE.TUTOR : ACTOR_TYPE.STUDENT,
        reason: "A required party rejected the reschedule proposal",
      });

      for (const recipientId of Object.keys(currentDecisions).filter(
        (id) => id !== userId,
      )) {
        await notification.write({
          db: tx,
          userId: recipientId,
          bookingId,
          category: NOTIFICATION_CATEGORY.BOOKING,
          severity: NOTIFICATION_SEVERITY.ACTION,
          title: "Reschedule rejected",
          body: "A required party declined the proposed new time.",
          eventKey: `booking.${bookingId}.reschedule_rejected`,
          emailRequired: true,
        });
      }

      return updated;
    });
  }

  async function createGroup(proposerId: string, input: CreateGroupInput) {
    const profile = await repo.findTutorProfile(db, input.tutorId, {
      publishedOnly: true,
    });
    if (!profile) throw new BookingNotFoundError(input.tutorId);

    // Validate invitees: registered users (DL-19), no duplicates, no self-
    // invite, and the total headcount must fit the target group size.
    const inviteeSet = new Set(input.inviteeUserIds);
    if (inviteeSet.size !== input.inviteeUserIds.length) {
      throw new BookingNotEditableError("duplicate invitees");
    }
    if (inviteeSet.has(proposerId)) {
      throw new BookingNotEditableError("proposer cannot invite themselves");
    }
    if (input.inviteeUserIds.length + 1 > input.targetGroupSize) {
      throw new BookingNotEditableError(
        `invitees exceed target group size ${input.targetGroupSize}`,
      );
    }
    const invitees = await repo.findUsersByIds(db, input.inviteeUserIds);
    if (invitees.length !== input.inviteeUserIds.length) {
      throw new BookingNotFoundError("invitee");
    }

    const slot = await repo.findAvailabilitySlot(
      db,
      input.availabilitySlotId,
      input.tutorId,
      { futureOnly: true },
    );
    if (!slot) throw new BookingNotEditableError(input.availabilitySlotId);

    const session = normalizeSession(input.scheduledStartAt);
    assertSessionFitsAvailability(slot, session, input.modality);

    const size = input.targetGroupSize;
    const priceSnapshot = await computePriceSnapshot(
      db,
      profile,
      input.modality,
      size as GroupSize,
    );
    const totalMarks = priceSnapshot.perStudent * size;

    const w = await wallet.getByUserId(db, proposerId);
    if (!w) throw new BookingNotFoundError(proposerId);
    if (w.availableBalance < totalMarks) {
      throw new InsufficientMarksError(totalMarks, w.availableBalance);
    }

    const bookingId = crypto.randomUUID();
    const deadlineAt = new Date(Date.now() + RESPONSE_WINDOW_MS);

    return db.transaction(async (tx) => {
      await lockTutorForBooking(tx, input.tutorId);
      const overlapping = await repo.findOverlappingBookings(
        tx,
        input.tutorId,
        session.scheduledStartAt,
        session.scheduledEndAt,
        { excludeStates: [...TERMINAL_STATES] },
      );
      if (overlapping.length > 0) {
        throw new BookingConflictError(
          input.tutorId,
          session.scheduledStartAt.toISOString(),
          session.scheduledEndAt.toISOString(),
        );
      }

      await wallet.hold(tx, {
        walletId: w.id,
        amount: totalMarks,
        eventKey: `booking.${bookingId}.hold`,
        sourceReference: bookingId,
        bookingId,
        actorType: ACTOR_TYPE.STUDENT,
        reason: "Hold Marks for group booking (proposer)",
      });

      const b = await repo.insertBooking(tx, {
        id: bookingId,
        type: BOOKING_TYPE.GROUP,
        modality: input.modality,
        tutorId: input.tutorId,
        proposerId,
        targetGroupSize: size,
        minConfirmedHeadcount: MIN_GROUP_HEADCOUNT,
        confirmedHeadcount: 1,
        currentState: BOOKING_STATE.AWAITING_PARTICIPANT_CONFIRMATION,
        scheduledStartAt: session.scheduledStartAt,
        scheduledEndAt: session.scheduledEndAt,
        timezone: input.timezone,
        learningGoal: input.learningGoal ?? "",
        priceSnapshot,
        originalMarks: totalMarks,
        holdAmount: totalMarks,
        deadlineAt,
      });

      await repo.insertParticipant(tx, {
        bookingId,
        userId: proposerId,
        role: "proposer",
        confirmationState: CONFIRMATION_STATE.CONFIRMED,
        heldAmount: totalMarks,
      });

      for (const inviteeId of input.inviteeUserIds) {
        // eslint-disable-next-line no-await-in-loop
        await repo.insertParticipant(tx, {
          bookingId,
          userId: inviteeId,
          role: "invitee",
          confirmationState: CONFIRMATION_STATE.PENDING,
          heldAmount: 0,
        });
        // eslint-disable-next-line no-await-in-loop
        await notification.write({
          db: tx,
          userId: inviteeId,
          bookingId,
          category: NOTIFICATION_CATEGORY.BOOKING,
          severity: NOTIFICATION_SEVERITY.ACTION,
          title: "Group booking invitation",
          body: [
            "You have been invited to a group session. Confirm within 12 hours.",
            `Schedule: ${session.scheduledStartAt.toISOString()}`,
            `Per-student price: ${priceSnapshot.perStudent} Marks`,
            `Total Marks held on acceptance: ${totalMarks}`,
            `View and accept in-platform: ${formatInviteCta(bookingId)}`,
          ].join(" "),
          eventKey: `booking.${bookingId}.invite.${inviteeId}`,
          emailRequired: true,
        });
      }

      await recordTransition(tx, {
        bookingId,
        fromState: null,
        toState: BOOKING_STATE.AWAITING_PARTICIPANT_CONFIRMATION,
        actorId: proposerId,
        actorType: ACTOR_TYPE.STUDENT,
      });

      // U14: room request at creation for offline groups (same semantics as
      // the solo path).
      let roomRequested = false;
      let roomConflict = false;
      if (
        input.modality === MODALITY.OFFLINE &&
        input.requestedRoomId &&
        roomPort
      ) {
        const request = await roomPort.requestRoomForBooking(tx, {
          bookingId,
          roomId: input.requestedRoomId,
          startAt: input.scheduledStartAt,
          endAt: session.scheduledEndAt,
        });
        roomRequested = request.available;
        roomConflict =
          request.available === false && request.reason === "taken";
      }

      return { ...b, roomRequested, roomConflict };
    });
  }

  async function confirmInvite(userId: string, bookingId: string) {
    return db.transaction(async (tx) => {
      const b = await repo.findBookingById(tx, bookingId);
      if (!b) throw new BookingNotFoundError(bookingId);
      if (b.currentState !== BOOKING_STATE.AWAITING_PARTICIPANT_CONFIRMATION) {
        throw new BookingNotAwaitingConfirmationError(
          bookingId,
          b.currentState,
        );
      }

      const participant = await repo.findParticipant(tx, bookingId, userId);
      if (!participant) throw new BookingNotOwnedError(bookingId, userId);
      if (participant.role !== "invitee")
        throw new BookingNotEditableError(bookingId);
      if (participant.confirmationState !== CONFIRMATION_STATE.PENDING) {
        throw new BookingParticipantAlreadyConfirmedError(participant.id);
      }

      const size = b.targetGroupSize;
      const pricePerStudent = (b.priceSnapshot?.perStudent ??
        DEFAULT_SOLO_PRICE) as number;

      // A group-series invitee accepts the whole package up front: the hold is
      // pricePerStudent per session × the number of sessions. The proposer of a
      // group-series also holds their own package up front, so the proposer
      // excess-release target matches the invitee hold.
      const isGroupSeries =
        b.type === BOOKING_TYPE.SERIES && b.targetGroupSize > 1;
      let inviteeHold = pricePerStudent;
      let proposerHoldTarget = pricePerStudent;
      if (isGroupSeries) {
        const sessions = await repo.listSessionsBySeriesId(tx, bookingId);
        const perSessionTotal = pricePerStudent * sessions.length;
        inviteeHold = perSessionTotal;
        proposerHoldTarget = perSessionTotal;
      }

      const w = await wallet.getByUserId(tx, userId);
      if (!w) throw new BookingNotFoundError(userId);
      if (w.availableBalance < inviteeHold) {
        throw new InsufficientMarksError(inviteeHold, w.availableBalance);
      }

      await wallet.hold(tx, {
        walletId: w.id,
        amount: inviteeHold,
        eventKey: `booking.${bookingId}.hold.${userId}`,
        sourceReference: bookingId,
        bookingId,
        actorType: ACTOR_TYPE.STUDENT,
        reason: isGroupSeries
          ? "Hold Marks for group-series booking (invitee)"
          : "Hold Marks for group booking (invitee)",
      });

      await repo.updateParticipantState(tx, participant.id, {
        confirmationState: CONFIRMATION_STATE.CONFIRMED,
        heldAmount: inviteeHold,
        confirmedAt: new Date(),
      });

      const updatedBooking = await repo.incrementBookingConfirmedHeadcount(
        tx,
        bookingId,
      );
      const newHeadcount = updatedBooking.confirmedHeadcount;

      // The proposer was held at the full target (size × perStudent) at
      // creation. As invitees confirm, release the proposer's excess so they
      // only ever hold their own share. The eventKey embeds newHeadcount so a
      // re-confirm can never double-release.
      const proposerParticipant = await repo.findParticipant(
        tx,
        bookingId,
        b.proposerId,
      );
      if (
        newHeadcount <= b.targetGroupSize &&
        proposerParticipant &&
        proposerParticipant.heldAmount > proposerHoldTarget
      ) {
        const proposerWallet = await wallet.getByUserId(tx, b.proposerId);
        if (proposerWallet) {
          const excess = proposerParticipant.heldAmount - proposerHoldTarget;
          // eslint-disable-next-line no-await-in-loop
          await wallet.release(tx, {
            walletId: proposerWallet.id,
            amount: excess,
            eventKey: `booking.${bookingId}.proposer.release.${newHeadcount}`,
            sourceReference: bookingId,
            bookingId,
            actorType: ACTOR_TYPE.STUDENT,
            reason: "Group: proposer excess hold released as invitees confirm",
          });
          await repo.updateParticipantState(tx, proposerParticipant.id, {
            heldAmount: proposerHoldTarget,
          });
        }
      }

      await repo.updateBookingHoldAmount(
        tx,
        bookingId,
        proposerHoldTarget * newHeadcount,
      );

      if (newHeadcount >= b.targetGroupSize) {
        await transition(tx, bookingId, BOOKING_STATE.AWAITING_TUTOR_REVIEW, {
          actorId: userId,
          actorType: ACTOR_TYPE.STUDENT,
          reason: "Full headcount reached",
        });
        await notification.write({
          db: tx,
          userId: b.tutorId,
          bookingId,
          category: NOTIFICATION_CATEGORY.BOOKING,
          severity: NOTIFICATION_SEVERITY.ACTION,
          title: "Group booking ready",
          body: "All participants confirmed. Review the booking.",
          eventKey: `booking.${bookingId}.full_headcount`,
          emailRequired: true,
        });
      }

      return { confirmedHeadcount: newHeadcount, targetGroupSize: size };
    });
  }

  async function declineInvite(
    userId: string,
    bookingId: string,
    reason?: string,
  ) {
    return db.transaction(async (tx) => {
      const b = await repo.findBookingById(tx, bookingId);
      if (!b) throw new BookingNotFoundError(bookingId);
      if (b.currentState !== BOOKING_STATE.AWAITING_PARTICIPANT_CONFIRMATION) {
        throw new BookingNotAwaitingConfirmationError(
          bookingId,
          b.currentState,
        );
      }

      const participant = await repo.findParticipant(tx, bookingId, userId);
      if (!participant) throw new BookingNotOwnedError(bookingId, userId);
      if (participant.role !== "invitee")
        throw new BookingNotEditableError(bookingId);
      if (participant.confirmationState !== CONFIRMATION_STATE.PENDING) {
        throw new BookingParticipantAlreadyConfirmedError(participant.id);
      }

      await repo.updateParticipantState(tx, participant.id, {
        confirmationState: CONFIRMATION_STATE.DECLINED,
        declinedAt: new Date(),
        withdrawnReason: reason,
      });

      return { declined: true };
    });
  }

  async function withdrawInvite(
    proposerId: string,
    bookingId: string,
    inviteeUserId: string,
    reason?: string,
  ) {
    return db.transaction(async (tx) => {
      const b = await repo.findBookingById(tx, bookingId);
      if (!b) throw new BookingNotFoundError(bookingId);
      if (b.currentState !== BOOKING_STATE.AWAITING_PARTICIPANT_CONFIRMATION) {
        throw new BookingNotAwaitingConfirmationError(
          bookingId,
          b.currentState,
        );
      }
      if (b.proposerId !== proposerId) {
        throw new BookingNotOwnedError(bookingId, proposerId);
      }
      if (
        b.type !== BOOKING_TYPE.GROUP &&
        !(b.type === BOOKING_TYPE.SERIES && b.targetGroupSize > 1)
      ) {
        throw new BookingNotEditableError(bookingId);
      }

      const participant = await repo.findParticipant(
        tx,
        bookingId,
        inviteeUserId,
      );
      if (!participant)
        throw new BookingParticipantNotFoundError(inviteeUserId);
      if (participant.role !== "invitee") {
        throw new BookingNotEditableError(bookingId);
      }
      if (participant.confirmationState !== CONFIRMATION_STATE.PENDING) {
        throw new BookingParticipantAlreadyConfirmedError(participant.id);
      }

      await repo.updateParticipantState(tx, participant.id, {
        confirmationState: CONFIRMATION_STATE.WITHDRAWN_PRE_H2,
        withdrawnAt: new Date(),
        withdrawnReason: reason,
      });
      await notification.writeBestEffort({
        db: tx,
        userId: inviteeUserId,
        bookingId,
        category: NOTIFICATION_CATEGORY.BOOKING,
        severity: NOTIFICATION_SEVERITY.ACTION,
        title: "Group invitation withdrawn",
        body: reason
          ? `The booking proposer withdrew your invitation. Reason: ${reason}`
          : "The booking proposer withdrew your invitation.",
        eventKey: `booking.${bookingId}.invite_withdrawn.${inviteeUserId}`,
        emailRequired: true,
      });

      return { withdrawn: true, inviteeUserId };
    });
  }

  async function reconfirm(userId: string, bookingId: string, accept: boolean) {
    return db.transaction(async (tx) => {
      const b = await repo.findBookingById(tx, bookingId);
      if (!b) throw new BookingNotFoundError(bookingId);
      if (b.currentState !== BOOKING_STATE.AWAITING_RECONFIRMATION) {
        throw new BookingNotAwaitingReconfirmationError(
          bookingId,
          b.currentState,
        );
      }

      const participant = await repo.findParticipant(tx, bookingId, userId);
      if (!participant) throw new BookingNotOwnedError(bookingId, userId);

      if (accept) {
        await repo.updateParticipantState(tx, participant.id, {
          confirmationState: CONFIRMATION_STATE.RECONFIRMED,
          reconfirmedAt: new Date(),
        });

        const reconfirmed = await repo.findReconfirmedParticipants(
          tx,
          bookingId,
        );
        const confirmedCount = await repo.findConfirmedParticipants(
          tx,
          bookingId,
        );

        if (reconfirmed.length === confirmedCount.length) {
          await transition(tx, bookingId, BOOKING_STATE.AWAITING_TUTOR_REVIEW, {
            actorId: userId,
            actorType: ACTOR_TYPE.STUDENT,
            reason: "All reconfirmed",
          });

          const confirmed = await repo.findConfirmedParticipants(tx, bookingId);
          await repriceGroupForHeadcount(tx, b, confirmed, ACTOR_TYPE.STUDENT);
        }
        return { reconfirmed: true };
      } else {
        // PRD: declining the repriced rate is treated like a pre-H-2
        // withdrawal — the participant's hold is released, the headcount is
        // decremented, and the group is repriced for the remaining headcount
        // (or cancelled when too few participants remain).
        if (participant.heldAmount > 0) {
          const declinedWallet = await wallet.getByUserId(tx, userId);
          if (!declinedWallet) throw new BookingNotFoundError(userId);
          await wallet.release(tx, {
            walletId: declinedWallet.id,
            amount: participant.heldAmount,
            eventKey: `booking.${bookingId}.reconfirm-decline.${userId}`,
            sourceReference: bookingId,
            bookingId,
            actorType: ACTOR_TYPE.STUDENT,
            reason: "Declined repriced group rate",
          });
        }

        await repo.updateParticipantState(tx, participant.id, {
          confirmationState: CONFIRMATION_STATE.DECLINED,
          declinedAt: new Date(),
          heldAmount: 0,
        });

        // A reconfirmation decline always comes from a confirmed/reconfirmed
        // participant — the headcount is always decremented here.
        await repo.decrementBookingConfirmedHeadcount(tx, bookingId);

        const remaining = await repo.findConfirmedParticipants(
          tx,
          bookingId,
          userId,
        );

        if (remaining.length < MIN_GROUP_HEADCOUNT) {
          await releaseAllParticipantHolds(
            tx,
            bookingId,
            "Group cancelled: not enough participants after reconfirmation decline",
            ACTOR_TYPE.STUDENT,
            userId,
          );
          await repo.updateBookingHoldAmount(tx, bookingId, 0);
          await transition(tx, bookingId, BOOKING_STATE.EXPIRED, {
            actorId: userId,
            actorType: ACTOR_TYPE.STUDENT,
            reason: "Not enough participants after reconfirmation decline",
          });
        } else {
          await repriceGroupForHeadcount(tx, b, remaining, ACTOR_TYPE.STUDENT);
          // M5: the surviving participants get a fresh 12h reconfirmation
          // window — the previous window may have been (near) exhausted.
          await repo.updateBookingDeadline(
            tx,
            bookingId,
            new Date(Date.now() + RESPONSE_WINDOW_MS),
          );
        }

        return { reconfirmed: false };
      }
    });
  }

  async function withdraw(userId: string, bookingId: string, reason?: string) {
    let cancelMeeting = false;
    const result = await db.transaction(async (tx) => {
      const b = await loadBookingAndAssertAccess(tx, userId, bookingId);
      // PRD (prd.tex:890): once confirmed, group-series participants cannot
      // opt out of the series as a whole (U4). Per-session cancellation is
      // already blocked in cancelSession; this guards the full-series path
      // before any wallet movement.
      if (b.type === BOOKING_TYPE.SERIES && b.targetGroupSize > 1) {
        throw new BookingSeriesNoOptOutError(bookingId);
      }
      if (TERMINAL_STATES.includes(b.currentState as BookingState)) {
        throw new BookingCancelledError(bookingId);
      }

      const participant = await repo.findParticipant(tx, bookingId, userId);
      if (!participant) throw new BookingParticipantNotFoundError(userId);

      const now = new Date();
      const h2 = new Date(
        b.scheduledStartAt.getTime() - LATE_CANCEL_THRESHOLD_MS,
      );
      const isLate = now > h2;

      // B7: a participant who already withdrew (or was marked no-show) cannot
      // withdraw again — no hold movement, no state churn, no second
      // headcount decrement.
      if (
        participant.confirmationState === CONFIRMATION_STATE.WITHDRAWN_PRE_H2 ||
        participant.confirmationState ===
          CONFIRMATION_STATE.WITHDRAWN_POST_H2 ||
        participant.confirmationState === CONFIRMATION_STATE.NO_SHOW
      ) {
        return { withdrawn: false, late: isLate };
      }

      const wasConfirmed =
        participant.confirmationState === CONFIRMATION_STATE.CONFIRMED ||
        participant.confirmationState === CONFIRMATION_STATE.RECONFIRMED;
      const participantState = isLate
        ? CONFIRMATION_STATE.WITHDRAWN_POST_H2
        : CONFIRMATION_STATE.WITHDRAWN_PRE_H2;

      if (participant.heldAmount > 0) {
        const participantWallet = await wallet.getByUserId(tx, userId);
        if (!participantWallet) throw new BookingNotFoundError(userId);
        if (isLate) {
          // PRD penalty: withdrawing after H-2 forfeits the held Marks.
          await wallet.deduct(tx, {
            walletId: participantWallet.id,
            amount: participant.heldAmount,
            eventKey: `booking.${bookingId}.withdraw-late.${userId}`,
            sourceReference: bookingId,
            bookingId,
            actorType: ACTOR_TYPE.STUDENT,
            reason: "Late withdrawal penalty",
          });
        } else {
          await wallet.release(tx, {
            walletId: participantWallet.id,
            amount: participant.heldAmount,
            eventKey: `booking.${bookingId}.withdraw.${userId}`,
            sourceReference: bookingId,
            bookingId,
            actorType: ACTOR_TYPE.STUDENT,
            reason: reason ?? "Withdrawal",
          });
        }
      }

      await repo.updateParticipantState(tx, participant.id, {
        confirmationState: participantState,
        withdrawnAt: new Date(),
        withdrawnReason: reason,
        heldAmount: 0,
      });

      // B7: only participants who were actually confirmed count towards
      // confirmedHeadcount — a pending invitee withdrawing never was counted.
      if (wasConfirmed) {
        await repo.decrementBookingConfirmedHeadcount(tx, bookingId);
      }

      const remaining = await repo.findConfirmedParticipants(
        tx,
        bookingId,
        userId,
      );

      if (
        b.type === BOOKING_TYPE.GROUP &&
        remaining.length < MIN_GROUP_HEADCOUNT
      ) {
        await releaseAllParticipantHolds(
          tx,
          bookingId,
          "Group cancelled: not enough participants",
          ACTOR_TYPE.STUDENT,
          userId,
        );

        await repo.updateBookingHoldAmount(tx, bookingId, 0);

        // B7+: PRD (prd.tex:846) says the booking expires when the minimum
        // headcount is no longer met. CANCELLED is not reachable from
        // awaiting_participant_confirmation/awaiting_reconfirmation — use
        // EXPIRED there instead of throwing (which would roll back the
        // withdrawal entirely).
        const cancelTarget = canTransition(
          b.currentState as BookingState,
          BOOKING_STATE.CANCELLED,
        )
          ? BOOKING_STATE.CANCELLED
          : BOOKING_STATE.EXPIRED;

        await transition(tx, bookingId, cancelTarget, {
          actorId: userId,
          actorType: ACTOR_TYPE.STUDENT,
          reason: "Not enough participants after withdrawal",
        });
      } else if (!isLate) {
        const currentState = b.currentState as BookingState;
        const regressableStates: ReadonlySet<BookingState> = new Set([
          BOOKING_STATE.AWAITING_PARTICIPANT_CONFIRMATION,
          BOOKING_STATE.AWAITING_TUTOR_REVIEW,
          BOOKING_STATE.AWAITING_ADMIN_ROOM_APPROVAL,
          BOOKING_STATE.CONFIRMED,
          BOOKING_STATE.SCHEDULED,
        ]);

        if (
          b.type === BOOKING_TYPE.GROUP &&
          regressableStates.has(currentState)
        ) {
          // PRD DL-13: a confirmed group participant withdrawing before H-2
          // triggers repricing + reconfirmation — the booking is NOT cancelled.
          // Any live meeting link is cancelled until the group re-confirms.
          // The provider call happens AFTER the transaction commits (R3).
          if (
            currentState === BOOKING_STATE.SCHEDULED ||
            currentState === BOOKING_STATE.CONFIRMED
          ) {
            cancelMeeting = true;
          }

          // M7: a `requested` roomBooking row must not survive the regression
          // — an admin `assignRoom` mid-reconfirmation would otherwise insert
          // a confirmed room for a booking that is heading back to tutor
          // review. No-op when the request was already confirmed/cancelled.
          if (
            currentState === BOOKING_STATE.AWAITING_ADMIN_ROOM_APPROVAL &&
            roomPort
          ) {
            await roomPort.cancelRequestedRoomForBooking(tx, bookingId);
          }

          await transition(
            tx,
            bookingId,
            BOOKING_STATE.AWAITING_RECONFIRMATION,
            {
              actorId: userId,
              actorType: ACTOR_TYPE.STUDENT,
              reason: "Participant withdrew before H-2",
            },
          );

          // M8: if the survivors cannot fund the higher per-student price
          // (InsufficientMarksError), the withdrawal must NOT roll back —
          // PRD TC-19 expects the group to fall through to expiry (the same
          // B5 handling expireBookings uses at the deadline).
          try {
            await repriceGroupForHeadcount(
              tx,
              b,
              remaining,
              ACTOR_TYPE.STUDENT,
            );
            // M5: the surviving participants get a fresh 12h reconfirmation
            // window (the old one may be near exhaustion or already passed).
            await repo.updateBookingDeadline(
              tx,
              bookingId,
              new Date(Date.now() + RESPONSE_WINDOW_MS),
            );
          } catch (error) {
            if (!(error instanceof InsufficientMarksError)) throw error;
            log({
              level: "warn",
              action: "withdraw_reprice_failed",
              bookingId,
              message:
                "Group reprice after withdrawal could not be funded; expiring the booking",
              error: { message: String(error) },
            });
            await releaseAllParticipantHolds(
              tx,
              bookingId,
              "Group cancelled: unfunded reprice after withdrawal",
              ACTOR_TYPE.STUDENT,
              userId,
            );
            await repo.updateBookingHoldAmount(tx, bookingId, 0);
            await transition(tx, bookingId, BOOKING_STATE.EXPIRED, {
              actorId: userId,
              actorType: ACTOR_TYPE.STUDENT,
              reason: "Not enough participants after withdrawal",
            });
          }
        } else if (b.type === BOOKING_TYPE.GROUP) {
          // A group in a non-regressable non-terminal state continues without
          // the withdrawer; their hold was released above and nothing is
          // stranded (the old code cancelled the whole booking here).
          void currentState;
        } else if (
          b.type === BOOKING_TYPE.SOLO ||
          b.type === BOOKING_TYPE.SERIES
        ) {
          // R2 + B3: solo / solo-series bookings always cancel on withdraw,
          // from any non-terminal state. The proposer is the only
          // participant — regressing to AWAITING_RECONFIRMATION would strand
          // a zero-hold booking that could be revived (and a later deduct
          // could consume another booking's hold). Zero the hold and cancel.
          await repo.updateBookingHoldAmount(tx, bookingId, 0);
          if (
            currentState === BOOKING_STATE.CONFIRMED ||
            currentState === BOOKING_STATE.SCHEDULED ||
            currentState === BOOKING_STATE.AWAITING_ADMIN_ROOM_APPROVAL
          ) {
            cancelMeeting = true;
          }
          // M7: cancel the pending room request so the freed room is never
          // assigned to a cancelled booking.
          if (
            currentState === BOOKING_STATE.AWAITING_ADMIN_ROOM_APPROVAL &&
            roomPort
          ) {
            await roomPort.cancelRequestedRoomForBooking(tx, bookingId);
          }
          await transition(tx, bookingId, BOOKING_STATE.CANCELLED, {
            actorId: userId,
            actorType: ACTOR_TYPE.STUDENT,
            reason: "Participant withdrew",
          });
        } else {
          // Unreachable defensive branch: any other booking type/state
          // combination cancels rather than stranding holds.
          await transition(tx, bookingId, BOOKING_STATE.CANCELLED, {
            actorId: userId,
            actorType: ACTOR_TYPE.STUDENT,
            reason: "Participant withdrew",
          });
        }
      }

      return { withdrawn: true, late: isLate };
    });

    // R3: provider-side calls (e.g. Google Calendar event deletion) must not
    // be inside the DB transaction — a later in-tx failure would have rolled
    // the booking back while the meeting was already cancelled.
    if (cancelMeeting) {
      await meeting.cancelEvent(bookingId);
    }

    return result;
  }

  async function createSeries(proposerId: string, input: CreateSeriesInput) {
    const profile = await repo.findTutorProfile(db, input.tutorId, {
      publishedOnly: true,
    });
    if (!profile) throw new BookingNotFoundError(input.tutorId);

    if (
      input.sessions.length < MIN_SERIES_SESSIONS ||
      input.sessions.length > MAX_SERIES_SESSIONS
    ) {
      throw new BookingSeriesSizeError(
        "",
        MIN_SERIES_SESSIONS,
        MAX_SERIES_SESSIONS,
      );
    }

    const sessions = await Promise.all(
      input.sessions.map(async (candidate) => {
        const session = normalizeSession(candidate.scheduledStartAt);
        const slotId = candidate.availabilitySlotId ?? input.availabilitySlotId;
        const slot = await repo.findAvailabilitySlot(
          db,
          slotId,
          input.tutorId,
          {
            futureOnly: true,
          },
        );
        if (!slot) throw new BookingNotEditableError(slotId);
        assertSessionFitsAvailability(slot, session, input.modality);
        return session;
      }),
    );
    assertNoIntraSeriesOverlap(sessions);

    const priceSnapshot = await computePriceSnapshot(
      db,
      profile,
      input.modality,
      1,
    );
    const perSession = priceSnapshot.perStudent;
    const totalMarks = perSession * input.sessions.length;

    const w = await wallet.getByUserId(db, proposerId);
    if (!w) throw new BookingNotFoundError(proposerId);
    if (w.availableBalance < totalMarks) {
      throw new InsufficientMarksError(totalMarks, w.availableBalance);
    }

    const bookingId = crypto.randomUUID();
    const deadlineAt = new Date(Date.now() + RESPONSE_WINDOW_MS);

    return db.transaction(async (tx) => {
      await lockTutorForBooking(tx, input.tutorId);
      for (const session of sessions) {
        // eslint-disable-next-line no-await-in-loop
        const overlapping = await repo.findOverlappingBookings(
          tx,
          input.tutorId,
          session.scheduledStartAt,
          session.scheduledEndAt,
          { excludeStates: [...TERMINAL_STATES] },
        );
        if (overlapping.length > 0) {
          throw new BookingConflictError(
            input.tutorId,
            session.scheduledStartAt.toISOString(),
            session.scheduledEndAt.toISOString(),
          );
        }
      }

      await wallet.hold(tx, {
        walletId: w.id,
        amount: totalMarks,
        eventKey: `booking.${bookingId}.hold`,
        sourceReference: bookingId,
        bookingId,
        actorType: ACTOR_TYPE.STUDENT,
        reason: "Hold Marks for series booking",
      });

      const b = await repo.insertBooking(tx, {
        id: bookingId,
        type: BOOKING_TYPE.SERIES,
        modality: input.modality,
        tutorId: input.tutorId,
        proposerId,
        targetGroupSize: 1,
        minConfirmedHeadcount: 1,
        confirmedHeadcount: 1,
        currentState: BOOKING_STATE.AWAITING_TUTOR_REVIEW,
        scheduledStartAt: sessions[0]!.scheduledStartAt,
        scheduledEndAt: sessions[sessions.length - 1]!.scheduledEndAt,
        timezone: input.timezone,
        learningGoal: input.learningGoal ?? "",
        priceSnapshot,
        originalMarks: totalMarks,
        holdAmount: totalMarks,
        deadlineAt,
      });

      await repo.insertParticipant(tx, {
        bookingId,
        userId: proposerId,
        role: "proposer",
        confirmationState: CONFIRMATION_STATE.CONFIRMED,
        heldAmount: totalMarks,
      });

      for (const session of sessions) {
        // eslint-disable-next-line no-await-in-loop
        await repo.insertBookingSession(tx, {
          seriesBookingId: bookingId,
          scheduledStartAt: session.scheduledStartAt,
          scheduledEndAt: session.scheduledEndAt,
          currentState: BOOKING_STATE.SCHEDULED,
          holdAmount: perSession,
          priceSnapshot,
        });
      }

      await recordTransition(tx, {
        bookingId,
        fromState: null,
        toState: BOOKING_STATE.AWAITING_TUTOR_REVIEW,
        actorId: proposerId,
        actorType: ACTOR_TYPE.STUDENT,
      });

      await notification.writeBestEffort({
        db: tx,
        userId: input.tutorId,
        bookingId,
        category: NOTIFICATION_CATEGORY.BOOKING,
        severity: NOTIFICATION_SEVERITY.ACTION,
        title: "New series request",
        body: `A student requested a ${input.sessions.length}-session series with you.`,
        eventKey: `booking.${bookingId}.tutor_request`,
        emailRequired: true,
      });

      return { ...b, disclaimer: computeDisclaimer(b) };
    });
  }

  async function createGroupSeries(
    proposerId: string,
    input: CreateGroupSeriesInput,
  ) {
    const profile = await repo.findTutorProfile(db, input.tutorId, {
      publishedOnly: true,
    });
    if (!profile) throw new BookingNotFoundError(input.tutorId);

    if (
      input.sessions.length < MIN_SERIES_SESSIONS ||
      input.sessions.length > MAX_SERIES_SESSIONS
    ) {
      throw new BookingSeriesSizeError(
        "",
        MIN_SERIES_SESSIONS,
        MAX_SERIES_SESSIONS,
      );
    }

    const sessions = await Promise.all(
      input.sessions.map(async (candidate) => {
        const session = normalizeSession(candidate.scheduledStartAt);
        const slotId = candidate.availabilitySlotId ?? input.availabilitySlotId;
        const slot = await repo.findAvailabilitySlot(
          db,
          slotId,
          input.tutorId,
          {
            futureOnly: true,
          },
        );
        if (!slot) throw new BookingNotEditableError(slotId);
        assertSessionFitsAvailability(slot, session, input.modality);
        return session;
      }),
    );
    assertNoIntraSeriesOverlap(sessions);

    // Validate the invitees are registered users (FR-20), with no duplicates
    // or self-invites, and the total headcount must fit the target size.
    const inviteeSet = new Set(input.inviteeUserIds);
    if (inviteeSet.size !== input.inviteeUserIds.length) {
      throw new BookingNotEditableError("duplicate invitees");
    }
    if (inviteeSet.has(proposerId)) {
      throw new BookingNotEditableError("proposer cannot invite themselves");
    }
    if (input.inviteeUserIds.length + 1 > input.targetGroupSize) {
      throw new BookingNotEditableError(
        `invitees exceed target group size ${input.targetGroupSize}`,
      );
    }
    const invitees = await repo.findUsersByIds(db, input.inviteeUserIds);
    if (invitees.length !== input.inviteeUserIds.length) {
      throw new BookingNotFoundError("invitee");
    }

    const size = input.targetGroupSize;
    const priceSnapshot = await computePriceSnapshot(
      db,
      profile,
      input.modality,
      size as GroupSize,
    );
    const perSession = priceSnapshot.perStudent;
    const packageTotal = perSession * input.sessions.length;

    const w = await wallet.getByUserId(db, proposerId);
    if (!w) throw new BookingNotFoundError(proposerId);
    if (w.availableBalance < packageTotal) {
      throw new InsufficientMarksError(packageTotal, w.availableBalance);
    }

    const bookingId = crypto.randomUUID();
    const deadlineAt = new Date(Date.now() + RESPONSE_WINDOW_MS);

    return db.transaction(async (tx) => {
      await lockTutorForBooking(tx, input.tutorId);
      for (const session of sessions) {
        // eslint-disable-next-line no-await-in-loop
        const overlapping = await repo.findOverlappingBookings(
          tx,
          input.tutorId,
          session.scheduledStartAt,
          session.scheduledEndAt,
          { excludeStates: [...TERMINAL_STATES] },
        );
        if (overlapping.length > 0) {
          throw new BookingConflictError(
            input.tutorId,
            session.scheduledStartAt.toISOString(),
            session.scheduledEndAt.toISOString(),
          );
        }
      }

      await wallet.hold(tx, {
        walletId: w.id,
        amount: packageTotal,
        eventKey: `booking.${bookingId}.hold`,
        sourceReference: bookingId,
        bookingId,
        actorType: ACTOR_TYPE.STUDENT,
        reason: "Hold Marks for group-series booking (proposer)",
      });

      const b = await repo.insertBooking(tx, {
        id: bookingId,
        type: BOOKING_TYPE.SERIES,
        modality: input.modality,
        tutorId: input.tutorId,
        proposerId,
        targetGroupSize: size,
        minConfirmedHeadcount: MIN_GROUP_HEADCOUNT,
        confirmedHeadcount: 1,
        currentState: BOOKING_STATE.AWAITING_PARTICIPANT_CONFIRMATION,
        scheduledStartAt: sessions[0]!.scheduledStartAt,
        scheduledEndAt: sessions[sessions.length - 1]!.scheduledEndAt,
        timezone: input.timezone,
        learningGoal: input.learningGoal ?? "",
        priceSnapshot,
        originalMarks: packageTotal,
        holdAmount: packageTotal,
        deadlineAt,
      });

      await repo.insertParticipant(tx, {
        bookingId,
        userId: proposerId,
        role: "proposer",
        confirmationState: CONFIRMATION_STATE.CONFIRMED,
        heldAmount: packageTotal,
      });

      for (const inviteeId of input.inviteeUserIds) {
        // eslint-disable-next-line no-await-in-loop
        await repo.insertParticipant(tx, {
          bookingId,
          userId: inviteeId,
          role: "invitee",
          confirmationState: CONFIRMATION_STATE.PENDING,
          heldAmount: 0,
        });
        // eslint-disable-next-line no-await-in-loop
        await notification.write({
          db: tx,
          userId: inviteeId,
          bookingId,
          category: NOTIFICATION_CATEGORY.BOOKING,
          severity: NOTIFICATION_SEVERITY.ACTION,
          title: "Group series invitation",
          body: [
            `You have been invited to a ${size}-person group series of ${input.sessions.length} sessions.`,
            `Schedule: ${sessions.map((s) => s.scheduledStartAt.toISOString()).join(", ")}`,
            `Per-student price per session: ${perSession} Marks`,
            `Total Marks held upfront on acceptance: ${packageTotal}`,
            GROUP_SERIES_DISCLAIMER,
            `View and accept in-platform: ${formatInviteCta(bookingId)}`,
          ].join(" "),
          eventKey: `booking.${bookingId}.invite.${inviteeId}`,
          emailRequired: true,
        });
      }

      for (const session of sessions) {
        // eslint-disable-next-line no-await-in-loop
        await repo.insertBookingSession(tx, {
          seriesBookingId: bookingId,
          scheduledStartAt: session.scheduledStartAt,
          scheduledEndAt: session.scheduledEndAt,
          currentState: BOOKING_STATE.SCHEDULED,
          holdAmount: perSession,
          priceSnapshot,
        });
      }

      await recordTransition(tx, {
        bookingId,
        fromState: null,
        toState: BOOKING_STATE.AWAITING_PARTICIPANT_CONFIRMATION,
        actorId: proposerId,
        actorType: ACTOR_TYPE.STUDENT,
      });

      await notification.writeBestEffort({
        db: tx,
        userId: input.tutorId,
        bookingId,
        category: NOTIFICATION_CATEGORY.BOOKING,
        severity: NOTIFICATION_SEVERITY.ACTION,
        title: "New group series request",
        body: `A student requested a ${size}-person, ${input.sessions.length}-session group series with you.`,
        eventKey: `booking.${bookingId}.tutor_request`,
        emailRequired: true,
      });

      return { ...b, disclaimer: computeDisclaimer(b) };
    });
  }

  async function listSessions(
    bookingId: string,
    userId: string,
    userRole?: string,
  ) {
    const b = await repo.findBookingById(db, bookingId);
    if (!b) throw new BookingNotFoundError(bookingId);
    if (userRole !== "admin") {
      await assertBookingAccess(b, userId, db, bookingId);
    }
    if (b.type !== BOOKING_TYPE.SERIES)
      throw new BookingNotEditableError(bookingId);
    return repo.listSessionsBySeriesId(db, bookingId);
  }

  /**
   * Aggregates tutor earnings from COMPLETED bookings in a date range.
   *
   * The stored per-booking `priceSnapshot` (G19-correct tutorShare/cogitoTake)
   * is authoritative — no flat-rate recomputation. For series bookings the
   * per-session snapshots are summed so a completed series pays out every
   * session; a series completed without session rows falls back to its
   * booking-level snapshot.
   */
  async function getTutorPayouts(input: {
    tutorId: string;
    dateFrom?: Date;
    dateTo?: Date;
  }): Promise<TutorPayoutResult> {
    const bookings = await repo.findCompletedBookingsByTutor(
      db,
      input.tutorId,
      input.dateFrom,
      input.dateTo,
    );

    let completedSessions = 0;
    let totalMarks = 0;
    let cogitoTake = 0;
    let tutorPayout = 0;
    let tutorPayoutIdr = 0;

    for (const b of bookings) {
      if (b.type === BOOKING_TYPE.SERIES) {
        // eslint-disable-next-line no-await-in-loop

        const sessions = await repo.listSessionsBySeriesId(db, b.id);
        const completed = sessions.filter(
          (s) => s.currentState === BOOKING_STATE.COMPLETED,
        );
        if (completed.length > 0) {
          for (const s of completed) {
            completedSessions++;
            const snap = s.priceSnapshot ?? b.priceSnapshot;
            totalMarks += snap?.actualMarksPooled ?? snap?.baseline ?? 0;
            cogitoTake += snap?.cogitoTake ?? 0;
            tutorPayout += snap?.tutorShare ?? 0;
            tutorPayoutIdr +=
              snap?.tutorHonorariumIdr ??
              (snap?.tutorShare ?? 0) * TUTOR_PAYOUT_RATE_IDR;
          }
          continue;
        }
      }
      completedSessions++;
      const snap = b.priceSnapshot;
      totalMarks += snap?.actualMarksPooled ?? snap?.baseline ?? 0;
      cogitoTake += snap?.cogitoTake ?? 0;
      tutorPayout += snap?.tutorShare ?? 0;
      tutorPayoutIdr +=
        snap?.tutorHonorariumIdr ??
        (snap?.tutorShare ?? 0) * TUTOR_PAYOUT_RATE_IDR;
    }

    return {
      completedSessions,
      totalMarks,
      cogitoTake,
      tutorPayout,
      tutorPayoutIdr: Math.round(tutorPayoutIdr),
    };
  }

  /**
   * Transitions an offline booking awaiting admin room approval to SCHEDULED
   * once a room has been assigned. Consumed by the room module via a
   * consumer-driven port so an assigned offline booking can actually be
   * completed (G14).
   */
  async function transitionBookingToScheduled(
    tx: DbOrTx,
    bookingId: string,
    actorId: string,
  ): Promise<void> {
    const b = await repo.findBookingById(tx, bookingId);
    if (!b) throw new BookingNotFoundError(bookingId);
    if (b.currentState !== BOOKING_STATE.AWAITING_ADMIN_ROOM_APPROVAL) return;
    await transition(tx, bookingId, BOOKING_STATE.SCHEDULED, {
      actorId,
      actorType: ACTOR_TYPE.ADMIN,
      reason: "Room assigned",
    });
    // B1: an offline SCHEDULED booking must not expire (NO_SHOW) at session
    // start — the room-approval deadline was capped at the start time. Bump
    // the deadline past session end (mirroring the online path), so the
    // no-show job only fires after the session finished plus a grace window.
    await repo.updateBookingDeadline(
      tx,
      bookingId,
      new Date(b.scheduledEndAt.getTime() + OFFLINE_SCHEDULED_GRACE_MS),
    );
  }

  /**
   * Cancels an offline booking whose room could not be provided (FR-22:
   * "cancel only if no room is available"). Called by the room module inside
   * `cancelRoomBooking` when the booking is still awaiting room approval.
   *
   * Releases all participant holds, zeroes the booking hold, transitions to
   * CANCELLED and records the cancellation reason + audit trail — the same
   * in-transaction guarantees the student cancel path provides (M6).
   *
   * @param tx - the active room-module transaction
   * @param bookingId - the booking id
   * @param actorId - the admin actor
   */
  async function cancelOfflineBooking(
    tx: DbOrTx,
    bookingId: string,
    actorId: string,
  ): Promise<void> {
    const b = await repo.findBookingById(tx, bookingId);
    if (!b) throw new BookingNotFoundError(bookingId);
    if (b.currentState !== BOOKING_STATE.AWAITING_ADMIN_ROOM_APPROVAL) return;

    await releaseAllParticipantHolds(
      tx,
      bookingId,
      "Booking cancelled: no room available",
      ACTOR_TYPE.ADMIN,
    );
    await repo.updateBookingHoldAmount(tx, bookingId, 0);

    await transition(tx, bookingId, BOOKING_STATE.CANCELLED, {
      actorId,
      actorType: ACTOR_TYPE.ADMIN,
      reason: "No room available",
    });
    await repo.updateBookingCancellationReason(
      tx,
      bookingId,
      "No room available",
    );
  }

  /**
   * Returns the recipients of offline-room lifecycle notifications: the tutor
   * and every confirmed student participant. Consumed by the room module via a
   * consumer-driven port (P1-3).
   */
  async function getBookingRecipients(
    tx: DbOrTx,
    bookingId: string,
  ): Promise<{ tutorId: string; participantUserIds: string[] }> {
    const b = await repo.findBookingById(tx, bookingId);
    if (!b) throw new BookingNotFoundError(bookingId);
    const participants = await repo.findConfirmedParticipants(tx, bookingId);
    return {
      tutorId: b.tutorId,
      participantUserIds: participants.map((p) => p.userId),
    };
  }

  /**
   * Creates the Google Meet event for a confirmed online booking and, on
   * success, transitions it to SCHEDULED with meeting-ready notifications.
   *
   * On failure the booking stays CONFIRMED and the failure is surfaced through
   * the meetingEvent row (status `failed`) so the `retry-failed-meetings`
   * scheduler job can retry it. The transaction is not aborted — the booking
   * remains recoverable either by retry or by the admin manual-link flow.
   *
   * @param tx - the active transaction
   * @param b - the booking row (must be CONFIRMED and online modality)
   * @param tutorId - the assigned tutor acting as the transition actor
   * @returns whether the booking was scheduled, plus the refreshed booking row
   */
  async function finalizeMeetingSchedule(
    tx: DbOrTx,
    b: BookingRow,
    tutorId: string,
  ): Promise<{ scheduled: boolean; booking: BookingRow }> {
    const bookingId = b.id;
    try {
      const participants = await repo.findConfirmedParticipants(tx, bookingId);
      const users = await repo.findUserEmails(tx, [
        b.tutorId,
        ...participants.map((p) => p.userId),
      ]);
      const attendees = users.map((u) => ({
        email: u.email,
        name: u.name,
      }));

      const meetingResult = await meeting.createEvent(
        bookingId,
        b.scheduledStartAt,
        b.scheduledEndAt,
        attendees,
        tx,
      );

      if (meetingResult.status === "failed") {
        return {
          scheduled: false,
          booking: (await repo.findBookingById(tx, bookingId)) ?? b,
        };
      }

      const updated = await transition(tx, bookingId, BOOKING_STATE.SCHEDULED, {
        actorId: tutorId,
        actorType: ACTOR_TYPE.TUTOR,
        reason: "Meeting created automatically",
      });

      await repo.updateBookingDeadline(
        tx,
        bookingId,
        new Date(b.scheduledEndAt.getTime() + 24 * 60 * 60 * 1000),
      );

      // L3: the "ready" copy is only truthful when the meeting row actually
      // carries a URL — the fallback (manual) provider creates a row with
      // meetingUrl null, so say "link pending" instead of promising a link.
      const linkReady = Boolean(meetingResult.meetingUrl);
      const tutorTitle = linkReady
        ? "Meeting link ready"
        : "Meeting link pending";
      const tutorBody = linkReady
        ? "The meeting link for the session is ready."
        : "The meeting link for the session is pending — an admin will add it before the session.";
      const participantTitle = linkReady
        ? "Meeting link ready"
        : "Meeting link pending";
      const participantBody = linkReady
        ? "The meeting link for your group session is ready."
        : "The meeting link for your group session is pending — an admin will add it before the session.";

      await notification.writeBestEffort({
        db: tx,
        userId: b.tutorId,
        bookingId,
        category: NOTIFICATION_CATEGORY.BOOKING,
        severity: NOTIFICATION_SEVERITY.ACTION,
        title: tutorTitle,
        body: tutorBody,
        eventKey: `booking.${bookingId}.scheduled.tutor`,
        emailRequired: true,
      });

      for (const p of participants) {
        if (p.userId === b.proposerId) continue;
        // eslint-disable-next-line no-await-in-loop
        await notification.writeBestEffort({
          db: tx,
          userId: p.userId,
          bookingId,
          category: NOTIFICATION_CATEGORY.BOOKING,
          severity: NOTIFICATION_SEVERITY.ACTION,
          title: participantTitle,
          body: participantBody,
          eventKey: `booking.${bookingId}.scheduled.${p.userId}`,
          emailRequired: true,
        });
      }

      return { scheduled: true, booking: updated };
    } catch (error) {
      log({
        level: "error",
        action: "meeting_finalize_failed",
        message:
          "Meeting creation or scheduled transition failed; booking left CONFIRMED and will be retried by the scheduler",
        error: { message: String(error) },
        bookingId,
        tutorId,
      });
      // L2: the local meetingEvent row is inside the booking tx and rolls back
      // with it — but the provider-side Google event cannot be rolled back. If
      // the failure happened after the event was created (e.g. a transition
      // version conflict), best-effort cancel the provider event so a re-accept
      // does not duplicate it.
      try {
        await meeting.cancelEvent(bookingId);
      } catch (cancelError) {
        log({
          level: "warn",
          action: "meeting_finalize_cleanup_failed",
          bookingId,
          error: { message: String(cancelError) },
        });
      }
      return {
        scheduled: false,
        booking: (await repo.findBookingById(tx, bookingId)) ?? b,
      };
    }
  }

  /**
   * Retries Google Meet creation for confirmed online bookings whose previous
   * attempt failed. Runs from the `retry-failed-meetings` scheduler job (5 min).
   *
   * Each booking is retried at most 3 times (counted via failed `meetingEvent`
   * rows); afterwards it stays CONFIRMED for manual intervention (admin
   * meeting-link entry, PRD-GAPS-PHASE3 U1).
   *
   * @returns the number of bookings scheduled and the number still failing
   */
  async function retryFailedMeetings(): Promise<{
    succeeded: number;
    failed: number;
  }> {
    const candidates = await repo.findConfirmedMeetingsPendingRetry(db);

    const outcomes = await mapLimit(candidates, 5, async (b) => {
      try {
        const scheduled = await db.transaction(async (tx) => {
          const result = await finalizeMeetingSchedule(tx, b, b.tutorId);
          return result.scheduled;
        });
        return { ok: true, scheduled };
      } catch (error) {
        log({
          level: "error",
          action: "retry_meeting_failed",
          bookingId: b.id,
          error: { message: String(error) },
        });
        return { ok: false, scheduled: false };
      }
    });

    let succeeded = 0;
    let failed = 0;
    for (const outcome of outcomes) {
      if (outcome.scheduled) succeeded++;
      else failed++;
    }
    return { succeeded, failed };
  }

  async function expireBookings() {
    const candidates = await repo.findBookingsExpiringByDeadline(db, [
      BOOKING_STATE.AWAITING_PARTICIPANT_CONFIRMATION,
      BOOKING_STATE.AWAITING_RECONFIRMATION,
      BOOKING_STATE.AWAITING_TUTOR_REVIEW,
      BOOKING_STATE.RESCHEDULE_PROPOSED,
      BOOKING_STATE.SCHEDULED,
      BOOKING_STATE.AWAITING_ADMIN_ROOM_APPROVAL,
    ]);

    const outcomes = await mapLimit(candidates, 5, async (b) => {
      try {
        let shouldCancelMeeting = true;
        await db.transaction(async (tx) => {
          if (b.currentState === BOOKING_STATE.RESCHEDULE_PROPOSED) {
            shouldCancelMeeting = false;
            const proposal = await repo.findPendingRescheduleProposal(tx, b.id);
            if (proposal) {
              await repo.updateRescheduleProposal(tx, proposal.id, {
                status: "expired",
                decidedAt: new Date(),
              });
            }
            const targetState =
              (b.previousState as BookingState | null) ??
              BOOKING_STATE.AWAITING_TUTOR_REVIEW;
            await transition(tx, b.id, targetState, {
              actorId: "system",
              actorType: ACTOR_TYPE.SYSTEM,
              reason: "Reschedule proposal expired; original time retained",
            });
            await repo.updateBookingDeadline(
              tx,
              b.id,
              targetState === BOOKING_STATE.AWAITING_TUTOR_REVIEW
                ? new Date(Date.now() + RESPONSE_WINDOW_MS)
                : new Date(b.scheduledEndAt.getTime() + 24 * 60 * 60 * 1000),
            );
            return;
          }
          // FR-16/TC-18: when a group deadline passes with a partial headcount
          // (>= 2 but < target), reprice to the final per-student total and
          // move the group to a fresh 12h reconfirmation window instead of
          // expiring it. Only groups that never reached the minimum headcount
          // expire and release all holds.
          const confirmed = await repo.findConfirmedParticipants(tx, b.id);
          const atRepricingDeadline =
            b.currentState ===
              BOOKING_STATE.AWAITING_PARTICIPANT_CONFIRMATION ||
            b.currentState === BOOKING_STATE.AWAITING_RECONFIRMATION;
          if (
            atRepricingDeadline &&
            confirmed.length >= MIN_GROUP_HEADCOUNT &&
            confirmed.length < b.targetGroupSize
          ) {
            // B5: if the reprice cannot be funded (InsufficientMarksError
            // etc.), fall back to the normal expiry path — the booking must
            // never stay wedged with a past deadline for the job to retry
            // every 5 minutes forever.
            let repriced = true;
            try {
              await repriceGroupForHeadcount(
                tx,
                b,
                confirmed,
                ACTOR_TYPE.SYSTEM,
              );
            } catch (error) {
              repriced = false;
              log({
                level: "warn",
                action: "expire_reprice_failed",
                bookingId: b.id,
                message:
                  "Group reprice at deadline failed; falling back to expiry",
                error: { message: String(error) },
              });
            }

            if (repriced) {
              await repo.updateBookingDeadline(
                tx,
                b.id,
                new Date(Date.now() + RESPONSE_WINDOW_MS),
              );

              // U3/B8: a group already in AWAITING_RECONFIRMATION stays there
              // (no self-transition); the first-deadline case moves into it.
              if (b.currentState !== BOOKING_STATE.AWAITING_RECONFIRMATION) {
                await transition(
                  tx,
                  b.id,
                  BOOKING_STATE.AWAITING_RECONFIRMATION,
                  {
                    actorId: "system",
                    actorType: ACTOR_TYPE.SYSTEM,
                    reason: "Group deadline passed with partial headcount",
                  },
                );
              }

              for (const p of confirmed) {
                // eslint-disable-next-line no-await-in-loop
                await notification.writeBestEffort({
                  db: tx,
                  userId: p.userId,
                  bookingId: b.id,
                  category: NOTIFICATION_CATEGORY.BOOKING,
                  severity: NOTIFICATION_SEVERITY.ACTION,
                  title: "Group deadline reached",
                  body: "Your group did not fill before the deadline. The per-student price was updated — please reconfirm within 12 hours.",
                  eventKey: `booking.${b.id}.deadline_reprice.${p.userId}`,
                  emailRequired: true,
                });
              }
              return;
            }
          }

          const targetState =
            EXPIRY_TARGET[b.currentState as string] ?? BOOKING_STATE.EXPIRED;

          const noShow = targetState === BOOKING_STATE.NO_SHOW;
          if (noShow) {
            // M2: a no-show forfeits the held Marks (PRD: no-show → deduct),
            // it does not release them — the "forgot to click anything"
            // default must enforce the forfeit, not hand the money back.
            const participants = await repo.findConfirmedParticipants(tx, b.id);
            for (const p of participants) {
              if (p.heldAmount <= 0) continue;
              // eslint-disable-next-line no-await-in-loop
              const w = await wallet.getByUserId(tx, p.userId);
              if (!w) continue;
              // eslint-disable-next-line no-await-in-loop
              await wallet.deduct(tx, {
                walletId: w.id,
                amount: p.heldAmount,
                eventKey: `booking.${b.id}.no_show.${p.userId}`,
                sourceReference: b.id,
                bookingId: b.id,
                actorType: ACTOR_TYPE.SYSTEM,
                reason: "No-show forfeit",
              });
              // eslint-disable-next-line no-await-in-loop
              await repo.updateParticipantState(tx, p.id, { heldAmount: 0 });
            }
          } else {
            await releaseAllParticipantHolds(
              tx,
              b.id,
              "Booking expired",
              ACTOR_TYPE.SYSTEM,
            );
          }

          await repo.updateBookingHoldAmount(tx, b.id, 0);

          await transition(tx, b.id, targetState, {
            actorId: "system",
            actorType: ACTOR_TYPE.SYSTEM,
            reason: "Deadline passed",
          });

          if (b.type === BOOKING_TYPE.SERIES) {
            await repo.cancelAllSessions(tx, b.id);
          }

          await notification.writeBestEffort({
            db: tx,
            userId: b.proposerId,
            bookingId: b.id,
            category: NOTIFICATION_CATEGORY.BOOKING,
            severity: noShow
              ? NOTIFICATION_SEVERITY.ACTION
              : NOTIFICATION_SEVERITY.INFO,
            title: noShow ? "Session marked as no-show" : "Booking expired",
            body: noShow
              ? "The session was marked as a no-show and held marks were forfeited."
              : "The booking deadline passed and held marks were released.",
            eventKey: `booking.${b.id}.expired.student`,
            emailRequired: noShow,
          });

          await notification.writeBestEffort({
            db: tx,
            userId: b.tutorId,
            bookingId: b.id,
            category: NOTIFICATION_CATEGORY.BOOKING,
            severity: noShow
              ? NOTIFICATION_SEVERITY.ACTION
              : NOTIFICATION_SEVERITY.INFO,
            title: noShow ? "Session marked as no-show" : "Booking expired",
            body: noShow
              ? "The session was marked as a no-show and held marks were forfeited."
              : "The booking expired because its deadline passed.",
            eventKey: `booking.${b.id}.expired.tutor`,
            emailRequired: noShow,
          });
        });
        // Best-effort cleanup of the provider-side event once the booking is
        // terminal (FR-21/OQ-05). No-op when no live event exists.
        if (shouldCancelMeeting) await meeting.cancelEvent(b.id);
        return { ok: true };
      } catch (error) {
        log({
          level: "error",
          action: "expire_booking_failed",
          bookingId: b.id,
          error: { message: String(error) },
        });
        return { ok: false };
      }
    });

    let succeeded = 0;
    let failed = 0;
    for (const outcome of outcomes) {
      if (outcome.ok) succeeded++;
      else failed++;
    }
    return { expired: succeeded, failed };
  }

  async function releaseExpiredHolds(): Promise<{ released: number }> {
    const candidates = await repo.findBookingsExpiringByDeadline(db, [
      BOOKING_STATE.AWAITING_PARTICIPANT_CONFIRMATION,
      BOOKING_STATE.AWAITING_RECONFIRMATION,
      BOOKING_STATE.AWAITING_TUTOR_REVIEW,
      BOOKING_STATE.RESCHEDULE_PROPOSED,
      BOOKING_STATE.SCHEDULED,
      BOOKING_STATE.AWAITING_ADMIN_ROOM_APPROVAL,
    ]);

    const outcomes = await mapLimit(candidates, 5, async (b) => {
      if (b.holdAmount <= 0) return { ok: true, released: false };
      try {
        let didRelease = false;
        await db.transaction(async (tx) => {
          const live = await repo.findBookingById(tx, b.id);
          if (!live) return;
          if (TERMINAL_STATES.includes(live.currentState as BookingState)) {
            // Raced with expireBookings (or an admin action): the holds are
            // already handled — never release from a terminal booking.
            return;
          }
          if (live.currentState === BOOKING_STATE.RESCHEDULE_PROPOSED) {
            // The proposal-expiry branch in expireBookings owns this path and
            // retains the holds for the restored schedule. Skipping keeps the
            // two jobs from fighting over the same booking (M4).
            return;
          }

          // M4: transition-or-skip — the terminal transition comes FIRST so a
          // version conflict throws before any wallet movement (a hold is only
          // ever released together with the transition; a later tutor
          // accept/complete can never deduct from a zeroed hold).
          const targetState =
            EXPIRY_TARGET[live.currentState as string] ?? BOOKING_STATE.EXPIRED;
          const noShow = targetState === BOOKING_STATE.NO_SHOW;
          await transition(tx, b.id, targetState, {
            actorId: "system",
            actorType: ACTOR_TYPE.SYSTEM,
            reason: "Deadline passed",
          });
          didRelease = true;

          if (noShow) {
            // Same forfeit semantics as expireBookings (M2).
            const participants = await repo.findConfirmedParticipants(tx, b.id);
            for (const p of participants) {
              if (p.heldAmount <= 0) continue;
              // eslint-disable-next-line no-await-in-loop
              const w = await wallet.getByUserId(tx, p.userId);
              if (!w) continue;
              // eslint-disable-next-line no-await-in-loop
              await wallet.deduct(tx, {
                walletId: w.id,
                amount: p.heldAmount,
                eventKey: `booking.${b.id}.no_show.${p.userId}`,
                sourceReference: b.id,
                bookingId: b.id,
                actorType: ACTOR_TYPE.SYSTEM,
                reason: "No-show forfeit",
              });
              // eslint-disable-next-line no-await-in-loop
              await repo.updateParticipantState(tx, p.id, { heldAmount: 0 });
            }
          } else {
            await releaseAllParticipantHolds(
              tx,
              b.id,
              "Hold released: deadline passed",
              ACTOR_TYPE.SYSTEM,
            );
          }

          await repo.updateBookingHoldAmount(tx, b.id, 0);

          await notification.writeBestEffort({
            db: tx,
            userId: b.proposerId,
            bookingId: b.id,
            category: NOTIFICATION_CATEGORY.BOOKING,
            severity: noShow
              ? NOTIFICATION_SEVERITY.ACTION
              : NOTIFICATION_SEVERITY.INFO,
            title: noShow
              ? "Session marked as no-show"
              : "Booking hold released",
            body: noShow
              ? "The session was marked as a no-show and held marks were forfeited."
              : "Held marks for an expired booking were released back to your balance.",
            eventKey: noShow
              ? `booking.${b.id}.expired.student`
              : `booking.${b.id}.hold_released_expiry`,
            emailRequired: noShow,
          });
        });
        return { ok: true, released: didRelease };
      } catch (error) {
        log({
          level: "error",
          action: "release_hold_failed",
          bookingId: b.id,
          error: { message: String(error) },
        });
        return { ok: false, released: false };
      }
    });

    let released = 0;
    for (const outcome of outcomes) {
      if (outcome.released) released++;
    }
    return { released };
  }

  async function checkTutorLateness(): Promise<{
    flagged: number;
    failed: number;
  }> {
    const candidates = await repo.findBookingsWithTutorLateness(db);

    const outcomes = await mapLimit(candidates, 5, async (b) => {
      try {
        const outcome = await db.transaction(async (tx) => {
          const overrideMeta: Record<string, unknown> = {
            ...((b.overrideMeta ?? {}) as Record<string, unknown>),
            category: "tutor_lateness_pending",
            flaggedAt: new Date().toISOString(),
          };
          const updated = await repo.updateBookingVersioned(
            tx,
            b.id,
            b.version,
            {
              overrideMeta,
            },
          );
          // Another writer changed the booking; skip silently and let the next
          // sweep re-evaluate it.
          if (!updated) return "skipped" as const;

          await audit.record({
            db: tx,
            actorId: null,
            actorType: ACTOR_TYPE.SYSTEM,
            action: "tutor_lateness_pending_review",
            targetId: b.id,
            targetType: "booking",
            details: {
              latenessMinutes: Math.floor(
                (Date.now() - b.scheduledStartAt.getTime()) / 60_000,
              ),
              scheduledStartAt: b.scheduledStartAt.toISOString(),
            },
          });

          await notification.writeBestEffort({
            db: tx,
            userId: b.proposerId,
            bookingId: b.id,
            category: NOTIFICATION_CATEGORY.BOOKING,
            severity: NOTIFICATION_SEVERITY.INFO,
            title: "Session flagged for review",
            body: "The session was flagged for admin review because tutor attendance was not confirmed.",
            eventKey: `booking.${b.id}.tutor_lateness_pending`,
          });

          await notification.writeBestEffort({
            db: tx,
            userId: b.tutorId,
            bookingId: b.id,
            category: NOTIFICATION_CATEGORY.BOOKING,
            severity: NOTIFICATION_SEVERITY.INFO,
            title: "Session flagged for review",
            body: "The session was flagged for admin review because tutor attendance was not confirmed.",
            eventKey: `booking.${b.id}.tutor_lateness_pending.tutor`,
          });

          return "flagged" as const;
        });
        return outcome;
      } catch (error) {
        log({
          level: "error",
          action: "tutor_lateness_check_failed",
          bookingId: b.id,
          error: { message: String(error) },
        });
        return "failed" as const;
      }
    });

    let flagged = 0;
    let failed = 0;
    for (const outcome of outcomes) {
      if (outcome === "flagged") flagged++;
      else if (outcome === "failed") failed++;
    }
    return { flagged, failed };
  }

  return {
    getById,
    getRescheduleAvailability,
    listMine,
    listForTutor,
    listAccessible,
    createSolo,
    createGroup,
    createSeries,
    createGroupSeries,
    confirmInvite,
    declineInvite,
    withdrawInvite,
    reconfirm,
    withdraw,
    cancel,
    tutorAccept,
    tutorDecline,
    completeSession,
    markTutorAttendance,
    markParticipantNoShow,
    proposeReschedule,
    acceptReschedule,
    rejectReschedule,
    cancelSession,
    addSessionNote,
    getSessionNotes,
    listSessions,
    getTutorPayouts,
    expireBookings,
    releaseExpiredHolds,
    checkTutorLateness,
    retryFailedMeetings,
    transition,
    canTransition,
    transitionBookingToScheduled,
    cancelOfflineBooking,
    getBookingRecipients,
  };
}
