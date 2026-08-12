import {
  BOOKING_TYPE,
  MODALITY,
  CONFIRMATION_STATE,
  NOTIFICATION_CATEGORY,
  NOTIFICATION_SEVERITY,
  ACTOR_TYPE,
  ATTENDANCE_STATE,
  RESPONSE_WINDOW_MS,
  LATE_CANCEL_THRESHOLD_MS,
  MIN_GROUP_HEADCOUNT,
  MIN_SERIES_SESSIONS,
  MAX_SERIES_SESSIONS,
  DEFAULT_SOLO_PRICE,
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
  GROUP_SERIES_DISCLAIMER,
} from "../../shared/constants";
import type { GroupSize } from "../pricing/pricing.service";

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
  BookingCancellationDeadlinePassedError,
  BookingSessionNotFoundError,
  BookingSessionNotCancellableError,
} from "./booking.errors";
import { log } from "../../lib/logger";
import {
  BOOKING_STATE,
  TERMINAL_STATES,
  type BookingState,
} from "./booking-state.types";
import { canTransition } from "./booking-transitions";
import type { BookingRepo } from "./booking.repo";
import type {
  BookingWalletPort,
  BookingPricingPort,
  BookingAuditPort,
  BookingNotificationPort,
  BookingMeetingPort,
} from "./index";

export interface CreateSoloInput {
  tutorId: string;
  availabilitySlotId: string;
  modality: "online" | "offline";
  scheduledStartAt: Date;
  scheduledEndAt: Date;
  timezone: string;
}

export interface CreateGroupInput {
  tutorId: string;
  availabilitySlotId: string;
  modality: "online" | "offline";
  targetGroupSize: number;
  inviteeUserIds: string[];
  scheduledStartAt: Date;
  scheduledEndAt: Date;
  timezone: string;
}

export interface CreateSeriesInput {
  tutorId: string;
  availabilitySlotId: string;
  modality: "online" | "offline";
  sessions: { scheduledStartAt: Date; scheduledEndAt: Date }[];
  timezone: string;
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

export type BookingService = ReturnType<typeof createBookingService>;

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
}) {
  const { db, repo, wallet, pricing, audit, notification, meeting } = deps;

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
    actorType: "student" | "tutor" | "system",
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
    const pricePerStudent = (profile.prices?.[String(newSize)] ??
      DEFAULT_SOLO_PRICE) as number;
    const newSnapshot = pricing.computeSplit(
      pricePerStudent * newSize,

      b.modality as Modality,
      pricePerStudent,
      newSize as GroupSize,
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
          eventKey: `booking.${b.id}.reprice.increase.${p.userId}`,
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
          eventKey: `booking.${b.id}.reprice.release.${p.userId}`,
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

      await repo.updateParticipantState(tx, p.id, { heldAmount: newPerStudent });
    }

    await repo.updateBookingPriceSnapshot(tx, b.id, {
      priceSnapshot: newSnapshot,
      holdAmount: newSnapshot.baseline,

      holdAmount: newPerStudent * newSize,
    });

    for (const p of remaining) {
      // eslint-disable-next-line no-await-in-loop
      await notification.writeBestEffort({
        db: tx,
        userId: p.userId,
        bookingId: b.id,
        category: NOTIFICATION_CATEGORY.BOOKING,
        severity: NOTIFICATION_SEVERITY.INFO,
        title: "Group price updated",
        body: `Your group's per-student price changed to ${newPerStudent} Marks because the headcount changed.`,
        eventKey: `booking.${b.id}.reprice.${p.userId}`,
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
  /**
   * Gets a booking by id, enforcing that the requesting user has access.
   *
   * @param bookingId - the booking to fetch
   * @param userId - the requesting user (proposer, tutor, or participant)
   * @returns the booking with participants and related data
   * @throws {BookingNotFoundError} if the booking does not exist
   * @throws {BookingNotOwnedError} if the user lacks access
   */
  async function getById(bookingId: string, userId: string) {
    const b = await repo.findBookingWithParticipants(bookingId);
    if (!b) throw new BookingNotFoundError(bookingId);
    await assertBookingAccess(b, userId, db, bookingId);
    return { ...b, disclaimer: computeDisclaimer(b) };
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
        ? items[items.length - 1]!.scheduledStartAt.toISOString()
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

    const modality = input.modality;
    if (modality === MODALITY.OFFLINE && profile.modality === MODALITY.ONLINE) {
      throw new BookingNotEditableError(input.tutorId);
    }
    if (modality === MODALITY.ONLINE && profile.modality === MODALITY.OFFLINE) {
      throw new BookingNotEditableError(input.tutorId);
    }

    const priceSnapshot = pricing.computeSplit(
      modality,
      (profile.prices?.["1"] ?? DEFAULT_SOLO_PRICE) as number,
      1,
    );
    const totalMarks = priceSnapshot.perStudent * 1;

    const w = await wallet.getByUserId(db, proposerId);
    if (!w) throw new BookingNotFoundError(proposerId);
    if (w.availableBalance < totalMarks) {
      throw new InsufficientMarksError(totalMarks, w.availableBalance);
    }

    const bookingId = crypto.randomUUID();
    const deadlineAt = new Date(Date.now() + RESPONSE_WINDOW_MS);

    return db.transaction(async (tx) => {
      const overlapping = await repo.findOverlappingBookings(
        tx,
        input.tutorId,
        input.scheduledStartAt,
        input.scheduledEndAt,
        { excludeStates: [...TERMINAL_STATES] },
      );
      if (overlapping.length > 0) {
        throw new BookingConflictError(
          input.tutorId,
          input.scheduledStartAt.toISOString(),
          input.scheduledEndAt.toISOString(),
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
        scheduledStartAt: input.scheduledStartAt,
        scheduledEndAt: input.scheduledEndAt,
        timezone: input.timezone,
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
      });

      return b;
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
    return db.transaction(async (tx) => {
      const b = await loadBookingAndAssertAccess(tx, userId, bookingId);
      if (TERMINAL_STATES.includes(b.currentState as BookingState)) {
        throw new BookingStateTransitionError(
          b.currentState,
          "cancel",
          b.currentState,
        );
      }

      const now = new Date();
      const h2 = new Date(
        b.scheduledStartAt.getTime() - LATE_CANCEL_THRESHOLD_MS,
      );
      const isLate = now > h2;
      const toState: BookingState = isLate
        ? BOOKING_STATE.LATE_CANCELLED
        : BOOKING_STATE.CANCELLED;

      if (b.type === BOOKING_TYPE.SERIES) {
        await repo.cancelAllSessions(tx, bookingId);
      }

      await releaseAllParticipantHolds(
        tx,
        bookingId,
        `Booking ${toState}: ${cancellationReason ?? "no reason"}`,
        ACTOR_TYPE.STUDENT,
      );

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
        severity: NOTIFICATION_SEVERITY.INFO,
        title: `Booking ${toState}`,
        body: `A student has ${toState} the booking.`,
        eventKey: `booking.${bookingId}.${toState}`,
      });

      return updated;
    });
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

      const isOffline = b.modality === MODALITY.OFFLINE;

      let updated;
      if (!isOffline) {
        await transition(tx, bookingId, BOOKING_STATE.CONFIRMED, {
          actorId: tutorId,
          actorType: ACTOR_TYPE.TUTOR,
        });

        try {
          const meetingResult = await meeting.createEvent(
            bookingId,
            b.scheduledStartAt,
            b.scheduledEndAt,
          );

          if (meetingResult.status === "failed") {
            updated = await repo.findBookingById(tx, bookingId);
          } else {
            updated = await transition(tx, bookingId, BOOKING_STATE.SCHEDULED, {
              actorId: tutorId,
              actorType: ACTOR_TYPE.TUTOR,
              reason: "Meeting created automatically",
            });

            await repo.updateBookingDeadline(
              tx,
              bookingId,
              new Date(b.scheduledEndAt.getTime() + 24 * 60 * 60 * 1000),
            );
          }
        } catch {
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

        await repo.updateBookingDeadline(tx, bookingId, b.scheduledStartAt);
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
    return db.transaction(async (tx) => {
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
        severity: NOTIFICATION_SEVERITY.INFO,
        title: "Booking declined",
        body: `Tutor declined the booking. ${reason ?? ""}`,
        eventKey: `booking.${bookingId}.declined`,
      });

      return updated;
    });
  }

  async function completeSession(bookingId: string, tutorId: string) {
    return db.transaction(async (tx) => {
      const b = await repo.findBookingById(tx, bookingId);
      if (!b) throw new BookingNotFoundError(bookingId);
      if (b.tutorId !== tutorId)
        throw new BookingNotOwnedError(bookingId, tutorId);
      if (b.type === BOOKING_TYPE.SERIES) {
        throw new BookingNotEditableError(bookingId);
      }
      if (b.currentState !== BOOKING_STATE.SCHEDULED) {
        throw new BookingStateTransitionError(
          b.currentState,
          "complete",
          BOOKING_STATE.COMPLETED,
        );
      }

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
    });
  }

  async function cancelSession(userId: string, sessionId: string) {
    return db.transaction(async (tx) => {
      const session = await repo.findSessionById(tx, sessionId);
      if (!session) throw new BookingSessionNotFoundError(sessionId);
      const b = await repo.findBookingById(tx, session.seriesBookingId);
      if (!b) throw new BookingNotFoundError(session.seriesBookingId);
      await assertBookingAccess(b, userId, tx, session.seriesBookingId);

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
      if (now > h2) {
        throw new BookingCancellationDeadlinePassedError(sessionId);
      }

      const participant = await repo.findParticipant(tx, b.id, userId);
      if (
        participant &&
        participant.heldAmount > 0 &&
        session.holdAmount > 0
      ) {
        const w = await wallet.getByUserId(tx, participant.userId);
        if (!w) throw new BookingNotFoundError(participant.userId);
        await wallet.release(tx, {
          walletId: w.id,
          amount: session.holdAmount,
          eventKey: `booking.${b.id}.session.${session.id}.cancel`,
          sourceReference: b.id,
          bookingId: b.id,
          actorType: ACTOR_TYPE.STUDENT,
          reason: "Series session cancelled",
        });
        await repo.updateParticipantState(tx, participant.id, {
          heldAmount: Math.max(0, participant.heldAmount - session.holdAmount),
        });
      }

      await repo.cancelSession(tx, session.id);
      await repo.updateBookingHoldAmount(
        tx,
        b.id,
        Math.max(0, b.holdAmount - session.holdAmount),
      );

      await notification.writeBestEffort({
        db: tx,
        userId: b.tutorId,
        bookingId: b.id,
        category: NOTIFICATION_CATEGORY.BOOKING,
        severity: NOTIFICATION_SEVERITY.INFO,
        title: "Series session cancelled",
        body: "A student cancelled one session of the series.",
        eventKey: `booking.${b.id}.session.${session.id}.cancelled`,
      });

      return { cancelled: true, sessionId };
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
    proposedEndAt: Date,
    reason?: string,
  ) {
    return db.transaction(async (tx) => {
      const b = await loadBookingAndAssertAccess(tx, userId, bookingId);
      if (TERMINAL_STATES.includes(b.currentState as BookingState)) {
        throw new BookingStateTransitionError(
          b.currentState,
          "reschedule",
          BOOKING_STATE.RESCHEDULE_PROPOSED,
        );
      }

      const updated = await transition(
        tx,
        bookingId,
        BOOKING_STATE.RESCHEDULE_PROPOSED,
        {
          actorId: userId,
          actorType: ACTOR_TYPE.STUDENT,
          reason,
          metadata: { proposedStartAt, proposedEndAt },
        },
      );

      await repo.insertRescheduleProposal(tx, {
        bookingId,
        proposedBy: userId,
        proposedStartAt,
        proposedEndAt,
        status: CONFIRMATION_STATE.PENDING,
      });

      await repo.updateBookingDeadline(
        tx,
        bookingId,
        new Date(Date.now() + 24 * 60 * 60 * 1000),
      );

      await notification.write({
        db: tx,
        userId: b.tutorId,
        bookingId,
        category: NOTIFICATION_CATEGORY.BOOKING,
        severity: NOTIFICATION_SEVERITY.ACTION,
        title: "Reschedule proposed",
        body: "Student proposed a new time for the booking.",
        eventKey: `booking.${bookingId}.reschedule_proposed`,
      });

      return updated;
    });
  }

  async function createGroup(proposerId: string, input: CreateGroupInput) {
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

    const size = input.targetGroupSize;
    const pricePerStudent = (profile.prices?.[String(size)] ??
      DEFAULT_SOLO_PRICE) as number;
    const priceSnapshot = pricing.computeSplit(
      input.modality,
      pricePerStudent,
      size as 1 | 2 | 3 | 4 | 5 | 6,
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
      const overlapping = await repo.findOverlappingBookings(
        tx,
        input.tutorId,
        input.scheduledStartAt,
        input.scheduledEndAt,
        { excludeStates: [...TERMINAL_STATES] },
      );
      if (overlapping.length > 0) {
        throw new BookingConflictError(
          input.tutorId,
          input.scheduledStartAt.toISOString(),
          input.scheduledEndAt.toISOString(),
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
        scheduledStartAt: input.scheduledStartAt,
        scheduledEndAt: input.scheduledEndAt,
        timezone: input.timezone,
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
          body: "You have been invited to a group session. Confirm within 12 hours.",
          eventKey: `booking.${bookingId}.invite.${inviteeId}`,
        });
      }

      await recordTransition(tx, {
        bookingId,
        fromState: null,
        toState: BOOKING_STATE.AWAITING_PARTICIPANT_CONFIRMATION,
        actorId: proposerId,
        actorType: ACTOR_TYPE.STUDENT,
      });

      return b;
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
      const holdAmount = pricePerStudent;

      const w = await wallet.getByUserId(tx, userId);
      if (!w) throw new BookingNotFoundError(userId);
      if (w.availableBalance < holdAmount) {
        throw new InsufficientMarksError(holdAmount, w.availableBalance);
      }

      await wallet.hold(tx, {
        walletId: w.id,
        amount: holdAmount,
        eventKey: `booking.${bookingId}.hold.${userId}`,
        sourceReference: bookingId,
        bookingId,
        actorType: ACTOR_TYPE.STUDENT,
        reason: "Hold Marks for group booking (invitee)",
      });

      await repo.updateParticipantState(tx, participant.id, {
        confirmationState: CONFIRMATION_STATE.CONFIRMED,
        heldAmount: holdAmount,
        confirmedAt: new Date(),
      });

      const newHeadcount = b.confirmedHeadcount + 1;
      await repo.updateBookingConfirmedHeadcount(tx, bookingId, newHeadcount);

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

          const confirmed = await repo.findConfirmedParticipants(
            tx,
            bookingId,
          );
          await repriceGroupForHeadcount(
            tx,
            b,
            confirmed,
            ACTOR_TYPE.STUDENT,
          );
        }
        return { reconfirmed: true };
      } else {
        await repo.updateParticipantState(tx, participant.id, {
          confirmationState: CONFIRMATION_STATE.DECLINED,
          declinedAt: new Date(),
        });
        return { reconfirmed: false };
      }
    });
  }

  async function withdraw(userId: string, bookingId: string, reason?: string) {
    return db.transaction(async (tx) => {
      const b = await loadBookingAndAssertAccess(tx, userId, bookingId);
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
      const participantState = isLate
        ? CONFIRMATION_STATE.WITHDRAWN_POST_H2
        : CONFIRMATION_STATE.WITHDRAWN_PRE_H2;

      if (participant.heldAmount > 0) {
        const participantWallet = await wallet.getByUserId(tx, userId);
        if (!participantWallet) throw new BookingNotFoundError(userId);
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

      await repo.updateParticipantState(tx, participant.id, {
        confirmationState: participantState,
        withdrawnAt: new Date(),
        withdrawnReason: reason,
        heldAmount: 0,
      });

      await repo.decrementBookingConfirmedHeadcount(tx, bookingId);

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

        await transition(tx, bookingId, BOOKING_STATE.CANCELLED, {
          actorId: userId,
          actorType: ACTOR_TYPE.STUDENT,
          reason: "Not enough participants after withdrawal",
        });
      } else if (!isLate) {
        const currentState = b.currentState as BookingState;
        if (
          currentState === BOOKING_STATE.AWAITING_PARTICIPANT_CONFIRMATION ||
          currentState === BOOKING_STATE.AWAITING_TUTOR_REVIEW
        ) {
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

          await repriceGroupForHeadcount(tx, b, remaining, ACTOR_TYPE.STUDENT);

          await repriceGroupForHeadcount(
            tx,
            b,
            remaining,
            ACTOR_TYPE.STUDENT,
          );
        } else {
          await transition(tx, bookingId, BOOKING_STATE.CANCELLED, {
            actorId: userId,
            actorType: ACTOR_TYPE.STUDENT,
            reason: "Participant withdrew",
          });
        }
      }

      return { withdrawn: true, late: isLate };
    });
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

    const slot = await repo.findAvailabilitySlot(
      db,
      input.availabilitySlotId,
      input.tutorId,
      { futureOnly: true },
    );
    if (!slot) throw new BookingNotEditableError(input.availabilitySlotId);

    const pricePerStudent = (profile.prices?.["1"] ??
      DEFAULT_SOLO_PRICE) as number;
    const priceSnapshot = pricing.computeSplit(
      input.modality,
      pricePerStudent,
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
      for (const session of input.sessions) {
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
        scheduledStartAt: input.sessions[0]!.scheduledStartAt,
        scheduledEndAt:
          input.sessions[input.sessions.length - 1]!.scheduledEndAt,
        timezone: input.timezone,
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

      for (const session of input.sessions) {
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

      return { ...b, disclaimer: computeDisclaimer(b) };
    });
  }

  async function listSessions(bookingId: string, userId: string) {
    const b = await repo.findBookingById(db, bookingId);
    if (!b) throw new BookingNotFoundError(bookingId);
    await assertBookingAccess(b, userId, db, bookingId);
    if (b.type !== BOOKING_TYPE.SERIES)
      throw new BookingNotEditableError(bookingId);
    return repo.listSessionsBySeriesId(db, bookingId);
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

    const EXPIRY_TARGET: Record<string, BookingState> = {
      [BOOKING_STATE.RESCHEDULE_PROPOSED]: BOOKING_STATE.EXPIRED,
      [BOOKING_STATE.SCHEDULED]: BOOKING_STATE.NO_SHOW,
      [BOOKING_STATE.AWAITING_ADMIN_ROOM_APPROVAL]: BOOKING_STATE.CANCELLED,
    };

    let succeeded = 0;
    let failed = 0;
    for (const b of candidates) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await db.transaction(async (tx) => {
          await releaseAllParticipantHolds(
            tx,
            b.id,
            "Booking expired",
            ACTOR_TYPE.SYSTEM,
          );

          await repo.updateBookingHoldAmount(tx, b.id, 0);

          const targetState =
            EXPIRY_TARGET[b.currentState as string] ?? BOOKING_STATE.EXPIRED;

          await transition(tx, b.id, targetState, {
            actorId: "system",
            actorType: ACTOR_TYPE.SYSTEM,
            reason: "Deadline passed",
          });

          if (b.type === BOOKING_TYPE.SERIES) {
            await repo.cancelAllSessions(tx, b.id);
          }

          const noShow = targetState === BOOKING_STATE.NO_SHOW;
          await notification.writeBestEffort({
            db: tx,
            userId: b.proposerId,
            bookingId: b.id,
            category: NOTIFICATION_CATEGORY.BOOKING,
            severity: NOTIFICATION_SEVERITY.INFO,
            title: noShow ? "Session marked as no-show" : "Booking expired",
            body: noShow
              ? "The session was marked as no-show and held marks were released."
              : "The booking deadline passed and held marks were released.",
            eventKey: `booking.${b.id}.expired.student`,
          });

          await notification.writeBestEffort({
            db: tx,
            userId: b.tutorId,
            bookingId: b.id,
            category: NOTIFICATION_CATEGORY.BOOKING,
            severity: NOTIFICATION_SEVERITY.INFO,
            title: noShow ? "Session marked as no-show" : "Booking expired",
            body: noShow
              ? "The session was marked as no-show and held marks were released."
              : "The booking expired because its deadline passed.",
            eventKey: `booking.${b.id}.expired.tutor`,
          });
        });
        succeeded++;
      } catch (error) {
        failed++;
        log({
          level: "error",
          action: "expire_booking_failed",
          bookingId: b.id,
          error: { message: String(error) },
        });
      }
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

    let released = 0;
    for (const b of candidates) {
      if (b.holdAmount <= 0) continue;
      try {
        // eslint-disable-next-line no-await-in-loop
        await db.transaction(async (tx) => {
          await releaseAllParticipantHolds(
            tx,
            b.id,
            "Hold released: deadline passed",
            ACTOR_TYPE.SYSTEM,
          );
          await repo.updateBookingHoldAmount(tx, b.id, 0);

          await notification.writeBestEffort({
            db: tx,
            userId: b.proposerId,
            bookingId: b.id,
            category: NOTIFICATION_CATEGORY.BOOKING,
            severity: NOTIFICATION_SEVERITY.INFO,
            title: "Booking hold released",
            body: "Held marks for an expired booking were released back to your balance.",
            eventKey: `booking.${b.id}.hold_released_expiry`,
          });
        });
        released++;
      } catch (error) {
        log({
          level: "error",
          action: "release_hold_failed",
          bookingId: b.id,
          error: { message: String(error) },
        });
      }
    }
    return { released };
  }

  async function checkTutorLateness(): Promise<{
    autoCancelled: number;
    failed: number;
  }> {
    const candidates = await repo.findBookingsWithTutorLateness(db);

    let autoCancelled = 0;
    let failed = 0;
    for (const b of candidates) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await db.transaction(async (tx) => {
          await releaseAllParticipantHolds(
            tx,
            b.id,
            "Tutor no-show: auto-cancelled",
            ACTOR_TYPE.SYSTEM,
          );

          await repo.updateBookingHoldAmount(tx, b.id, 0);

          const tutorParticipant = await repo.findTutorParticipant(tx, b.id);
          if (tutorParticipant) {
            await repo.updateParticipantState(tx, tutorParticipant.id, {
              attendanceState: ATTENDANCE_STATE.ABSENT,
            });
          } else {
            await repo.insertParticipant(tx, {
              bookingId: b.id,
              userId: b.tutorId,
              role: "tutor",
              confirmationState: CONFIRMATION_STATE.CONFIRMED,
              heldAmount: 0,
              attendanceState: ATTENDANCE_STATE.ABSENT,
            });
          }

          await transition(tx, b.id, BOOKING_STATE.NO_SHOW, {
            actorId: "system",
            actorType: ACTOR_TYPE.SYSTEM,
            reason: "Tutor did not join within the lateness window",
            metadata: {
              latenessMinutes: Math.floor(
                (Date.now() - b.scheduledStartAt.getTime()) / 60_000,
              ),
            },
          });

          await notification.writeBestEffort({
            db: tx,
            userId: b.proposerId,
            bookingId: b.id,
            category: NOTIFICATION_CATEGORY.BOOKING,
            severity: NOTIFICATION_SEVERITY.ACTION,
            title: "Session auto-cancelled",
            body: "The tutor did not join within 15 minutes, so the session was auto-cancelled and held marks were released.",
            eventKey: `booking.${b.id}.tutor_no_show`,
          });

          await notification.writeBestEffort({
            db: tx,
            userId: b.tutorId,
            bookingId: b.id,
            category: NOTIFICATION_CATEGORY.BOOKING,
            severity: NOTIFICATION_SEVERITY.INFO,
            title: "Session auto-cancelled",
            body: "You did not join the session within 15 minutes, so it was auto-cancelled.",
            eventKey: `booking.${b.id}.tutor_no_show.tutor`,
          });
        });
        autoCancelled++;
      } catch (error) {
        failed++;
        log({
          level: "error",
          action: "tutor_lateness_check_failed",
          bookingId: b.id,
          error: { message: String(error) },
        });
      }
    }
    return { autoCancelled, failed };
  }

  return {
    getById,
    listMine,
    createSolo,
    createGroup,
    createSeries,
    confirmInvite,
    declineInvite,
    reconfirm,
    withdraw,
    cancel,
    tutorAccept,
    tutorDecline,
    completeSession,
    markTutorAttendance,
    proposeReschedule,
    cancelSession,
    listSessions,
    expireBookings,
    releaseExpiredHolds,
    checkTutorLateness,
    transition,
    canTransition,
  };
}
