import {
  BOOKING_TYPE,
  MODALITY,
  CONFIRMATION_STATE,
  NOTIFICATION_CATEGORY,
  NOTIFICATION_SEVERITY,
  ACTOR_TYPE,
  RESPONSE_WINDOW_MS,
  LATE_CANCEL_THRESHOLD_MS,
  MIN_GROUP_HEADCOUNT,
  MIN_SERIES_SESSIONS,
  MAX_SERIES_SESSIONS,
  DEFAULT_SOLO_PRICE,
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
} from "../../shared/constants";
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
  BookingSessionNotEndedError,
  BookingSeriesSizeError,
  BookingParticipantNotFoundError,
  BookingParticipantAlreadyConfirmedError,
  BookingCancelledError,
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
  actorId: string;
  actorType: "student" | "tutor" | "admin" | "system";
  metadata?: Record<string, unknown>;
}

export type BookingService = ReturnType<typeof createBookingService>;

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
      actorId: params.actorId,
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
      });
    }
  }

  async function getById(bookingId: string, userId: string) {
    const b = await repo.findBookingWithParticipants(bookingId);
    if (!b) throw new BookingNotFoundError(bookingId);
    await assertBookingAccess(b, userId, db, bookingId);
    return b;
  }

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
        ? items[items.length - 1]!.scheduledStartAt.toISOString()
        : null;
    return { items, nextCursor };
  }

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
      (profile.prices?.["1"] ?? DEFAULT_SOLO_PRICE) as number,
      1,
    );
    const totalMarks = priceSnapshot.baseline;

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
    const accepted = await db.transaction(async (tx) => {
      const b = await repo.findBookingById(tx, bookingId);
      if (!b) throw new BookingNotFoundError(bookingId);
      if (b.tutorId !== tutorId)
        throw new BookingNotOwnedError(bookingId, tutorId);
      if (b.currentState !== BOOKING_STATE.AWAITING_TUTOR_REVIEW) {
        throw new BookingNotAwaitingReviewError(bookingId, b.currentState);
      }

      const isOffline = b.modality === MODALITY.OFFLINE;

      if (!isOffline) {
        const updated = await transition(
          tx,
          bookingId,
          BOOKING_STATE.CONFIRMED,
          {
            actorId: tutorId,
            actorType: ACTOR_TYPE.TUTOR,
          },
        );
        return {
          updated,
          isOffline,
          proposerId: b.proposerId,
          scheduledStartAt: b.scheduledStartAt,
          scheduledEndAt: b.scheduledEndAt,
        };
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
        const updated = await repo.findBookingById(tx, bookingId);
        return {
          updated: updated!,
          isOffline,
          proposerId: b.proposerId,
          scheduledStartAt: b.scheduledStartAt,
          scheduledEndAt: b.scheduledEndAt,
        };
      }
    });

    if (accepted.isOffline) {
      await notification.write({
        db,
        userId: accepted.proposerId,
        bookingId,
        category: NOTIFICATION_CATEGORY.BOOKING,
        severity: NOTIFICATION_SEVERITY.ACTION,
        title: "Booking accepted",
        body: "Tutor accepted. Waiting for admin room approval.",
        eventKey: `booking.${bookingId}.accepted`,
      });

      return accepted.updated!;
    }

    let finalBooking = accepted.updated!;
    let notificationBody =
      "Tutor accepted. Meeting link will be assigned shortly.";

    try {
      const meetingResult = await meeting.createEvent(
        bookingId,
        accepted.scheduledStartAt,
        accepted.scheduledEndAt,
      );

      if (meetingResult.status !== "failed") {
        finalBooking = await db.transaction(async (tx) => {
          const current = await repo.findBookingById(tx, bookingId);
          if (!current) throw new BookingNotFoundError(bookingId);
          if (current.currentState !== BOOKING_STATE.CONFIRMED) {
            return current;
          }

          const scheduled = await transition(
            tx,
            bookingId,
            BOOKING_STATE.SCHEDULED,
            {
              actorId: tutorId,
              actorType: ACTOR_TYPE.TUTOR,
              reason: "Meeting created automatically",
            },
          );

          await repo.updateBookingDeadline(
            tx,
            bookingId,
            new Date(accepted.scheduledEndAt.getTime() + 24 * 60 * 60 * 1000),
          );

          return scheduled;
        });

        notificationBody = "Tutor accepted. Session scheduled.";
      }
    } catch {
      finalBooking =
        (await repo.findBookingById(db, bookingId)) ?? finalBooking;
    }

    await notification.write({
      db,
      userId: accepted.proposerId,
      bookingId,
      category: NOTIFICATION_CATEGORY.BOOKING,
      severity: NOTIFICATION_SEVERITY.ACTION,
      title: "Booking accepted",
      body: notificationBody,
      eventKey: `booking.${bookingId}.accepted`,
    });

    return finalBooking;
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
      if (b.scheduledEndAt.getTime() > Date.now()) {
        throw new BookingSessionNotEndedError(bookingId, b.scheduledEndAt);
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
      pricePerStudent * size,
      size as 1 | 2 | 3 | 4 | 5 | 6,
    );
    const totalMarks = priceSnapshot.baseline;

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
    const priceSnapshot = pricing.computeSplit(pricePerStudent, 1);
    const perSession = priceSnapshot.baseline;
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

      return b;
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

  return {
    getById,
    listMine,
    listForTutor,
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
    proposeReschedule,
    listSessions,
    expireBookings,
    releaseExpiredHolds,
    transition,
    canTransition,
  };
}
