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
import { notFound, conflict, forbidden, badRequest } from "../../lib/errors";
import { log } from "../../lib/logger";
import type { WalletPort } from "../../shared/ports/wallet.port";
import type { PricingPort } from "../../shared/ports/pricing.port";
import type { AuditPort } from "../../shared/ports/audit.port";
import type { InAppNotificationPort } from "../../shared/ports/notification.port";
import type { MeetingPort } from "../../shared/ports/meeting.port";
import type { BookingRepo } from "./booking.repo";
import {
  BOOKING_STATES,
  TERMINAL_STATES,
  type BookingState,
} from "./booking-state.types";
import { canTransition } from "./booking-transitions";

export { BOOKING_STATES, TERMINAL_STATES, canTransition };
export type { BookingState };

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
  wallet: WalletPort;
  pricing: PricingPort;
  audit: AuditPort;
  notification: InAppNotificationPort;
  meeting: MeetingPort;
}) {
  const { db, repo, wallet, pricing, audit, notification, meeting } = deps;

  async function assertStudentBookingAccess(
    conn: DbOrTx,
    userId: string,
    bookingId: string,
  ) {
    const b = await repo.findBookingById(conn, bookingId);
    if (!b) throw notFound("Booking not found");
    if (b.proposerId !== userId) {
      const participant = await repo.findParticipant(conn, bookingId, userId);
      if (!participant) {
        throw forbidden("You do not have access to this booking");
      }
    }
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
    if (!b) throw notFound("Booking not found");
    const fromState = b.currentState as BookingState;

    if (!canTransition(fromState, toState)) {
      throw conflict(
        `Cannot transition booking from ${fromState} to ${toState}`,
      );
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
      throw conflict("Booking was modified by another request. Please retry.");
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

  async function getById(bookingId: string) {
    const b = await repo.findBookingWithParticipants(bookingId);
    if (!b) throw notFound("Booking not found");
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
    });
    const items = rows.slice(0, limit);
    const nextCursor = rows.length > limit ? items[items.length - 1]!.id : null;
    return { items, nextCursor };
  }

  async function createSolo(proposerId: string, input: CreateSoloInput) {
    const profile = await repo.findTutorProfile(db, input.tutorId);
    if (!profile) throw notFound("Tutor profile not found");

    const slot = await repo.findAvailabilitySlot(
      db,
      input.availabilitySlotId,
      input.tutorId,
      { futureOnly: true },
    );
    if (!slot) throw badRequest("Selected availability slot is not available");

    const modality = input.modality;
    if (modality === MODALITY.OFFLINE && profile.modality === MODALITY.ONLINE) {
      throw badRequest("Tutor does not support offline sessions");
    }
    if (modality === MODALITY.ONLINE && profile.modality === MODALITY.OFFLINE) {
      throw badRequest("Tutor does not support online sessions");
    }

    const overlapping = await repo.findOverlappingBookings(
      db,
      input.tutorId,
      input.scheduledStartAt,
      input.scheduledEndAt,
    );
    if (overlapping.length > 0) {
      throw conflict("Tutor already has a booking at this time");
    }

    const priceSnapshot = pricing.computeSplit(
      (profile.prices?.["1"] ?? DEFAULT_SOLO_PRICE) as number,
      1,
    );
    const totalMarks = priceSnapshot.baseline;

    const w = await wallet.getByUserId(db, proposerId);
    if (!w) throw notFound("Wallet not found");
    if (w.availableBalance < totalMarks) {
      throw conflict("Insufficient available Marks");
    }

    const bookingId = crypto.randomUUID();
    const deadlineAt = new Date(Date.now() + RESPONSE_WINDOW_MS);

    return db.transaction(async (tx) => {
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
        currentState: "awaiting_tutor_review",
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
        toState: "awaiting_tutor_review",
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
        afterState: { currentState: "awaiting_tutor_review" },
        details: { type: BOOKING_TYPE.SOLO, tutorId: input.tutorId, modality },
      });

      await notification.write({
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
      const b = await assertStudentBookingAccess(tx, userId, bookingId);
      if (TERMINAL_STATES.includes(b.currentState as BookingState)) {
        throw conflict("Booking is already in a terminal state");
      }

      const now = new Date();
      const h2 = new Date(
        b.scheduledStartAt.getTime() - LATE_CANCEL_THRESHOLD_MS,
      );
      const isLate = now > h2;
      const toState: BookingState = isLate ? "late_cancelled" : "cancelled";

      if (b.holdAmount > 0) {
        const proposerWallet = await wallet.getByUserId(tx, b.proposerId);
        if (!proposerWallet) throw notFound("Wallet not found");
        await wallet.release(tx, {
          walletId: proposerWallet.id,
          amount: b.holdAmount,
          eventKey: `booking.${bookingId}.cancel_release`,
          sourceReference: bookingId,
          bookingId,
          actorType: ACTOR_TYPE.STUDENT,
          reason: `Booking ${toState}: ${cancellationReason ?? "no reason"}`,
        });
      }

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

      await notification.write({
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
      if (!b) throw notFound("Booking not found");
      if (b.tutorId !== tutorId) throw forbidden("Not your booking");
      if (b.currentState !== "awaiting_tutor_review") {
        throw conflict("Booking is not awaiting tutor review");
      }

      const isOffline = b.modality === MODALITY.OFFLINE;
      const toState: BookingState = isOffline
        ? "awaiting_admin_room_approval"
        : "confirmed";

      await transition(tx, bookingId, toState, {
        actorId: tutorId,
        actorType: ACTOR_TYPE.TUTOR,
      });

      let updated;
      if (!isOffline) {
        updated = await transition(tx, bookingId, "scheduled", {
          actorId: tutorId,
          actorType: ACTOR_TYPE.TUTOR,
          reason: "Meeting created automatically",
        });
      } else {
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

    if (!result.isOffline) {
      try {
        await meeting.createEvent(
          bookingId,
          result.b.scheduledStartAt,
          result.b.scheduledEndAt,
        );
      } catch (error) {
        log({
          level: "error",
          action: "meeting_creation_failed",
          bookingId,
          error: { message: String(error) },
        });
      }
    }

    return result.updated!;
  }

  async function tutorDecline(
    bookingId: string,
    tutorId: string,
    reason?: string,
  ) {
    return db.transaction(async (tx) => {
      const b = await repo.findBookingById(tx, bookingId);
      if (!b) throw notFound("Booking not found");
      if (b.tutorId !== tutorId) throw forbidden("Not your booking");
      if (b.currentState !== "awaiting_tutor_review") {
        throw conflict("Booking is not awaiting tutor review");
      }

      if (b.holdAmount > 0) {
        const proposerWallet = await wallet.getByUserId(tx, b.proposerId);
        if (!proposerWallet) throw notFound("Wallet not found");
        await wallet.release(tx, {
          walletId: proposerWallet.id,
          amount: b.holdAmount,
          eventKey: `booking.${bookingId}.decline_release`,
          sourceReference: bookingId,
          bookingId,
          actorType: ACTOR_TYPE.TUTOR,
          reason: reason ?? "Tutor declined",
        });
      }

      const updated = await transition(tx, bookingId, "declined", {
        actorId: tutorId,
        actorType: ACTOR_TYPE.TUTOR,
        reason,
      });

      await notification.write({
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

  async function completeSession(
    bookingId: string,
    tutorId: string,
    _sessionNote?: string,
  ) {
    return db.transaction(async (tx) => {
      const b = await repo.findBookingById(tx, bookingId);
      if (!b) throw notFound("Booking not found");
      if (b.tutorId !== tutorId) throw forbidden("Not your booking");
      if (b.type === BOOKING_TYPE.SERIES) {
        throw badRequest("Series bookings must be completed per session");
      }
      if (b.currentState !== "scheduled") {
        throw conflict("Only scheduled bookings can be completed");
      }

      const proposerWallet = await wallet.getByUserId(tx, b.proposerId);
      if (!proposerWallet) throw notFound("Wallet not found");
      await wallet.deduct(tx, {
        walletId: proposerWallet.id,
        amount: b.holdAmount,
        eventKey: `booking.${bookingId}.deduct`,
        sourceReference: bookingId,
        bookingId,
        actorType: ACTOR_TYPE.TUTOR,
        reason: "Session completed",
      });

      const updated = await transition(tx, bookingId, "completed", {
        actorId: tutorId,
        actorType: ACTOR_TYPE.TUTOR,
      });

      await repo.updateBookingHoldAmount(tx, bookingId, 0);

      await notification.write({
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
    if (proposedEndAt <= proposedStartAt) {
      throw badRequest("End time must be after start time");
    }

    return db.transaction(async (tx) => {
      const b = await assertStudentBookingAccess(tx, userId, bookingId);
      if (TERMINAL_STATES.includes(b.currentState as BookingState)) {
        throw conflict("Booking is already in a terminal state");
      }

      const updated = await transition(tx, bookingId, "reschedule_proposed", {
        actorId: userId,
        actorType: ACTOR_TYPE.STUDENT,
        reason,
        metadata: { proposedStartAt, proposedEndAt },
      });

      await repo.insertRescheduleProposal(tx, {
        bookingId,
        proposedBy: userId,
        proposedStartAt,
        proposedEndAt,
        status: CONFIRMATION_STATE.PENDING,
      });

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
    const profile = await repo.findTutorProfile(db, input.tutorId);
    if (!profile) throw notFound("Tutor profile not found");

    const slot = await repo.findAvailabilitySlot(
      db,
      input.availabilitySlotId,
      input.tutorId,
      { futureOnly: true },
    );
    if (!slot) throw badRequest("Selected availability slot is not available");

    const overlapping = await repo.findOverlappingBookings(
      db,
      input.tutorId,
      input.scheduledStartAt,
      input.scheduledEndAt,
    );
    if (overlapping.length > 0) {
      throw conflict("Tutor already has a booking at this time");
    }

    const size = input.targetGroupSize;
    const pricePerStudent = (profile.prices?.[String(size)] ??
      DEFAULT_SOLO_PRICE) as number;
    const priceSnapshot = pricing.computeSplit(
      pricePerStudent * size,
      size as 1 | 2 | 3 | 4 | 5 | 6,
    );
    const totalMarks = priceSnapshot.baseline;

    const w = await wallet.getByUserId(db, proposerId);
    if (!w) throw notFound("Wallet not found");
    if (w.availableBalance < totalMarks) {
      throw conflict("Insufficient available Marks for proposer hold");
    }

    const bookingId = crypto.randomUUID();
    const deadlineAt = new Date(Date.now() + RESPONSE_WINDOW_MS);

    return db.transaction(async (tx) => {
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
        currentState: "awaiting_participant_confirmation",
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
        await repo.insertParticipant(tx, {
          bookingId,
          userId: inviteeId,
          role: "invitee",
          confirmationState: CONFIRMATION_STATE.PENDING,
          heldAmount: 0,
        });
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
        toState: "awaiting_participant_confirmation",
        actorId: proposerId,
        actorType: ACTOR_TYPE.STUDENT,
      });

      return b;
    });
  }

  async function confirmInvite(userId: string, bookingId: string) {
    return db.transaction(async (tx) => {
      const b = await repo.findBookingById(tx, bookingId);
      if (!b) throw notFound("Booking not found");
      if (b.currentState !== "awaiting_participant_confirmation") {
        throw conflict("Booking is not awaiting participant confirmation");
      }

      const participant = await repo.findParticipant(tx, bookingId, userId);
      if (!participant) throw forbidden("You are not a participant");
      if (participant.role !== "invitee")
        throw badRequest("Only invitees confirm");
      if (participant.confirmationState !== CONFIRMATION_STATE.PENDING) {
        throw conflict("Invite already confirmed or declined");
      }

      const size = b.targetGroupSize;
      const pricePerStudent = (b.priceSnapshot?.perStudent ??
        DEFAULT_SOLO_PRICE) as number;
      const holdAmount = pricePerStudent;

      const w = await wallet.getByUserId(tx, userId);
      if (!w) throw notFound("Wallet not found");
      if (w.availableBalance < holdAmount) {
        throw conflict("Insufficient available Marks");
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
        await transition(tx, bookingId, "awaiting_tutor_review", {
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
      if (!b) throw notFound("Booking not found");
      if (b.currentState !== "awaiting_participant_confirmation") {
        throw conflict("Booking is not awaiting participant confirmation");
      }

      const participant = await repo.findParticipant(tx, bookingId, userId);
      if (!participant) throw forbidden("You are not a participant");
      if (participant.role !== "invitee")
        throw badRequest("Only invitees decline");
      if (participant.confirmationState !== CONFIRMATION_STATE.PENDING) {
        throw conflict("Invite already confirmed or declined");
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
      if (!b) throw notFound("Booking not found");
      if (b.currentState !== "awaiting_reconfirmation") {
        throw conflict("Booking is not awaiting reconfirmation");
      }

      const participant = await repo.findParticipant(tx, bookingId, userId);
      if (!participant) throw forbidden("You are not a participant");

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
          await transition(tx, bookingId, "awaiting_tutor_review", {
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
      const b = await assertStudentBookingAccess(tx, userId, bookingId);
      if (TERMINAL_STATES.includes(b.currentState as BookingState)) {
        throw conflict("Booking is already terminal");
      }

      const participant = await repo.findParticipant(tx, bookingId, userId);
      if (!participant) throw forbidden("You are not a participant");

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
        if (!participantWallet) throw notFound("Wallet not found");
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

      const remaining = await repo.findConfirmedParticipants(
        tx,
        bookingId,
        userId,
      );

      if (
        b.type === BOOKING_TYPE.GROUP &&
        remaining.length < MIN_GROUP_HEADCOUNT
      ) {
        await transition(tx, bookingId, "cancelled", {
          actorId: userId,
          actorType: ACTOR_TYPE.STUDENT,
          reason: "Not enough participants after withdrawal",
        });
      } else if (!isLate) {
        const currentState = b.currentState as BookingState;
        if (
          currentState === "awaiting_participant_confirmation" ||
          currentState === "awaiting_tutor_review" ||
          currentState === "awaiting_marks_hold"
        ) {
          await transition(tx, bookingId, "awaiting_reconfirmation", {
            actorId: userId,
            actorType: ACTOR_TYPE.STUDENT,
            reason: "Participant withdrew before H-2",
          });
        } else {
          await transition(tx, bookingId, "cancelled", {
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
    const profile = await repo.findTutorProfile(db, input.tutorId);
    if (!profile) throw notFound("Tutor profile not found");

    if (
      input.sessions.length < MIN_SERIES_SESSIONS ||
      input.sessions.length > MAX_SERIES_SESSIONS
    ) {
      throw badRequest(
        `Series must have ${MIN_SERIES_SESSIONS}-${MAX_SERIES_SESSIONS} sessions`,
      );
    }

    const slot = await repo.findAvailabilitySlot(
      db,
      input.availabilitySlotId,
      input.tutorId,
    );
    if (!slot) throw badRequest("Selected availability slot is not available");

    for (const session of input.sessions) {
      const overlapping = await repo.findOverlappingBookings(
        db,
        input.tutorId,
        session.scheduledStartAt,
        session.scheduledEndAt,
      );
      if (overlapping.length > 0) {
        throw conflict("Tutor already has a booking at this time");
      }
    }

    const pricePerStudent = (profile.prices?.["1"] ??
      DEFAULT_SOLO_PRICE) as number;
    const priceSnapshot = pricing.computeSplit(pricePerStudent, 1);
    const perSession = priceSnapshot.baseline;
    const totalMarks = perSession * input.sessions.length;

    const w = await wallet.getByUserId(db, proposerId);
    if (!w) throw notFound("Wallet not found");
    if (w.availableBalance < totalMarks) {
      throw conflict("Insufficient available Marks for series");
    }

    const bookingId = crypto.randomUUID();

    return db.transaction(async (tx) => {
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
        currentState: "awaiting_tutor_review",
        scheduledStartAt: input.sessions[0]!.scheduledStartAt,
        scheduledEndAt:
          input.sessions[input.sessions.length - 1]!.scheduledEndAt,
        timezone: input.timezone,
        priceSnapshot,
        originalMarks: totalMarks,
        holdAmount: totalMarks,
      });

      await repo.insertParticipant(tx, {
        bookingId,
        userId: proposerId,
        role: "proposer",
        confirmationState: CONFIRMATION_STATE.CONFIRMED,
        heldAmount: totalMarks,
      });

      for (const session of input.sessions) {
        await repo.insertBookingSession(tx, {
          seriesBookingId: bookingId,
          scheduledStartAt: session.scheduledStartAt,
          scheduledEndAt: session.scheduledEndAt,
          currentState: "scheduled",
          holdAmount: perSession,
          priceSnapshot,
        });
      }

      await recordTransition(tx, {
        bookingId,
        fromState: null,
        toState: "awaiting_tutor_review",
        actorId: proposerId,
        actorType: ACTOR_TYPE.STUDENT,
      });

      return b;
    });
  }

  async function listSessions(bookingId: string) {
    const b = await repo.findBookingById(db, bookingId);
    if (!b) throw notFound("Booking not found");
    if (b.type !== BOOKING_TYPE.SERIES)
      throw badRequest("Booking is not a series");
    return repo.listSessionsBySeriesId(db, bookingId);
  }

  async function expireBookings() {
    const candidates = await repo.findBookingsExpiringByDeadline(db, [
      "awaiting_participant_confirmation",
      "awaiting_reconfirmation",
      "awaiting_marks_hold",
      "awaiting_tutor_review",
    ]);

    for (const b of candidates) {
      try {
        await db.transaction(async (tx) => {
          if (b.holdAmount > 0) {
            const w = await wallet.getByUserId(tx, b.proposerId);
            if (w) {
              await wallet.release(tx, {
                walletId: w.id,
                amount: b.holdAmount,
                eventKey: `booking.${b.id}.expire_release`,
                sourceReference: b.id,
                bookingId: b.id,
                actorType: ACTOR_TYPE.SYSTEM,
                reason: "Booking expired",
              });
            }
          }
          await transition(tx, b.id, "expired", {
            actorId: "system",
            actorType: ACTOR_TYPE.SYSTEM,
            reason: "Deadline passed",
          });
        });
      } catch (error) {
        log({
          level: "error",
          action: "expire_booking_failed",
          bookingId: b.id,
          error: { message: String(error) },
        });
      }
    }
    return { expired: candidates.length };
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
    proposeReschedule,
    listSessions,
    expireBookings,
    transition,
    canTransition,
  };
}
