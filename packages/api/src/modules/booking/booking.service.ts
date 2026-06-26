import { eq, and, gte, desc, inArray, ne, lte } from "drizzle-orm";
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
import { notFound, conflict, forbidden, badRequest } from "../../lib/errors";
import type { WalletPort } from "../../shared/ports/wallet.port";
import type { PricingPort } from "../../shared/ports/pricing.port";
import type { AuditPort } from "../../shared/ports/audit.port";
import type { InAppNotificationPort } from "../../shared/ports/notification.port";
import type { MeetingPort } from "../../shared/ports/meeting.port";

export const BOOKING_STATES = [
  "draft",
  "awaiting_marks_hold",
  "awaiting_tutor_review",
  "awaiting_participant_confirmation",
  "awaiting_reconfirmation",
  "awaiting_admin_room_approval",
  "confirmed",
  "scheduled",
  "completed",
  "declined",
  "cancelled",
  "late_cancelled",
  "no_show",
  "expired",
  "reschedule_proposed",
] as const;

export type BookingState = (typeof BOOKING_STATES)[number];

export const TERMINAL_STATES: BookingState[] = [
  "declined",
  "cancelled",
  "late_cancelled",
  "no_show",
  "expired",
  "completed",
];

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

const TRANSITIONS: Record<
  BookingState,
  { to: BookingState[]; auto?: boolean }
> = {
  draft: { to: ["awaiting_marks_hold"] },
  awaiting_marks_hold: { to: ["awaiting_tutor_review", "expired"] },
  awaiting_tutor_review: {
    to: ["declined", "confirmed", "reschedule_proposed", "expired"],
  },
  awaiting_participant_confirmation: {
    to: ["awaiting_reconfirmation", "awaiting_tutor_review", "expired"],
  },
  awaiting_reconfirmation: {
    to: ["confirmed", "expired"],
  },
  awaiting_admin_room_approval: {
    to: ["scheduled", "reschedule_proposed", "cancelled"],
  },
  confirmed: {
    to: [
      "awaiting_admin_room_approval",
      "scheduled",
      "cancelled",
      "late_cancelled",
    ],
  },
  scheduled: {
    to: ["completed", "cancelled", "late_cancelled", "no_show"],
  },
  completed: { to: [] },
  declined: { to: [] },
  cancelled: { to: [] },
  late_cancelled: { to: [] },
  no_show: { to: [] },
  expired: { to: [] },
  reschedule_proposed: {
    to: ["awaiting_reconfirmation", "declined"],
  },
};

export function canTransition(
  from: BookingState | null,
  to: BookingState,
): boolean {
  if (!from) return true;
  return TRANSITIONS[from]?.to.includes(to) ?? false;
}

export function createBookingService(deps: {
  db: DbType;
  wallet: WalletPort;
  pricing: PricingPort;
  audit: AuditPort;
  notification: InAppNotificationPort;
  meeting: MeetingPort;
}) {
  const { db, wallet, pricing, audit, notification, meeting } = deps;

  async function assertStudentBookingAccess(
    conn: DbOrTx,
    userId: string,
    bookingId: string,
  ) {
    const [b] = await conn
      .select()
      .from(booking)
      .where(eq(booking.id, bookingId))
      .limit(1);
    if (!b) throw notFound("Booking not found");
    if (b.proposerId !== userId) {
      const participant = await conn
        .select()
        .from(bookingParticipant)
        .where(
          and(
            eq(bookingParticipant.bookingId, bookingId),
            eq(bookingParticipant.userId, userId),
          ),
        )
        .limit(1);
      if (participant.length === 0) {
        throw forbidden("You do not have access to this booking");
      }
    }
    return b as unknown as typeof bookingTable.$inferSelect;
  }

  async function recordTransition(conn: DbOrTx, entry: BookingTransition) {
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
    const [b] = await conn
      .select()
      .from(booking)
      .where(eq(booking.id, bookingId))
      .limit(1);
    if (!b) throw notFound("Booking not found");
    const fromState = b.currentState as BookingState;

    if (!canTransition(fromState, toState)) {
      throw conflict(
        `Cannot transition booking from ${fromState} to ${toState}`,
      );
    }

    const [updated] = await conn
      .update(booking)
      .set({
        currentState: toState,
        previousState: fromState,
        stateReason: params.reason ?? b.stateReason,
        updatedAt: new Date(),
      })
      .where(eq(booking.id, bookingId))
      .returning();

    await recordTransition(conn, {
      bookingId,
      fromState,
      toState,
      reason: params.reason,
      actorId: params.actorId,
      actorType: params.actorType,
      metadata: params.metadata,
    });

    return updated!;
  }

  async function getById(bookingId: string) {
    const b = await db.query.booking.findFirst({
      where: eq(booking.id, bookingId),
      with: {
        participants: { with: { user: true } },
        stateHistory: true,
        meeting: true,
        roomBookings: { with: { room: true } },
      },
    });
    if (!b) throw notFound("Booking not found");
    return b;
  }

  async function listMine(
    userId: string,
    opts: { cursor?: string; limit?: number; states?: string[] } = {},
  ) {
    const limit = Math.min(opts.limit ?? 20, 100);
    const conditions = [eq(booking.proposerId, userId)];
    if (opts.states?.length) {
      conditions.push(inArray(booking.currentState, opts.states));
    }
    const rows = await db.query.booking.findMany({
      where: and(...conditions),
      orderBy: [desc(booking.scheduledStartAt)],
      limit: limit + 1,
      with: { participants: { with: { user: true } } },
    });
    const items = rows.slice(0, limit);
    const nextCursor = rows.length > limit ? items[items.length - 1]!.id : null;
    return { items, nextCursor };
  }

  async function createSolo(proposerId: string, input: CreateSoloInput) {
    const profile = await db.query.tutorProfile.findFirst({
      where: and(
        eq(tutorProfile.userId, input.tutorId),
        eq(tutorProfile.onboardingStatus, "published"),
      ),
    });
    if (!profile) throw notFound("Tutor profile not found");

    const slot = await db.query.availabilitySlot.findFirst({
      where: and(
        eq(availabilitySlot.id, input.availabilitySlotId),
        eq(availabilitySlot.tutorId, input.tutorId),
        eq(availabilitySlot.isActive, true),
        gte(availabilitySlot.startDate, new Date()),
      ),
    });
    if (!slot) throw badRequest("Selected availability slot is not available");

    const modality = input.modality;
    if (modality === "offline" && profile.modality === "online") {
      throw badRequest("Tutor does not support offline sessions");
    }
    if (modality === "online" && profile.modality === "offline") {
      throw badRequest("Tutor does not support online sessions");
    }

    const priceSnapshot = pricing.computeSplit(
      (profile.prices?.["1"] ?? 50) as number,
      1,
    );
    const totalMarks = priceSnapshot.baseline;

    const w = await wallet.getByUserId(db, proposerId);
    if (!w) throw notFound("Wallet not found");
    if (w.availableBalance < totalMarks) {
      throw conflict("Insufficient available Marks");
    }

    const bookingId = crypto.randomUUID();
    const deadlineAt = new Date(Date.now() + 12 * 60 * 60 * 1000);

    return db.transaction(async (tx) => {
      await wallet.hold(tx, {
        walletId: w.id,
        amount: totalMarks,
        eventKey: `booking.${bookingId}.hold`,
        sourceReference: bookingId,
        actorType: "student",
        reason: "Hold Marks for solo booking",
      });

      const [b] = await tx
        .insert(booking)
        .values({
          id: bookingId,
          type: "solo",
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
        })
        .returning();

      await tx.insert(bookingParticipant).values({
        bookingId,
        userId: proposerId,
        role: "proposer",
        confirmationState: "confirmed",
        heldAmount: totalMarks,
      });

      await recordTransition(tx, {
        bookingId,
        fromState: null,
        toState: "awaiting_tutor_review",
        actorId: proposerId,
        actorType: "student",
      });

      await audit.record({
        db: tx,
        actorId: proposerId,
        actorType: "student",
        action: "booking_created",
        targetId: bookingId,
        targetType: "booking",
        beforeState: {},
        afterState: { currentState: "awaiting_tutor_review" },
        details: { type: "solo", tutorId: input.tutorId, modality },
      });

      await notification.write({
        db: tx,
        userId: input.tutorId,
        bookingId,
        category: "booking",
        severity: "action",
        title: "New booking request",
        body: "A student has requested a solo session with you.",
        eventKey: `booking.${bookingId}.tutor_request`,
      });

      return b!;
    });
  }

  async function cancel(
    userId: string,
    bookingId: string,
    cancellationReason?: string,
  ) {
    const b = await assertStudentBookingAccess(db, userId, bookingId);
    if (TERMINAL_STATES.includes(b.currentState as BookingState)) {
      throw conflict("Booking is already in a terminal state");
    }

    const now = new Date();
    const h2 = new Date(b.scheduledStartAt.getTime() - 2 * 60 * 60 * 1000);
    const isLate = now > h2;
    const toState: BookingState = isLate ? "late_cancelled" : "cancelled";

    return db.transaction(async (tx) => {
      if (b.holdAmount > 0) {
        await wallet.release(tx, {
          walletId: b.proposerId,
          amount: b.holdAmount,
          eventKey: `booking.${bookingId}.cancel_release`,
          sourceReference: bookingId,
          actorType: "student",
          reason: `Booking ${toState}: ${cancellationReason ?? "no reason"}`,
        });
      }

      const updated = await transition(tx, bookingId, toState, {
        actorId: userId,
        actorType: "student",
        reason: cancellationReason,
      });

      await tx
        .update(booking)
        .set({ cancellationReason: cancellationReason ?? null })
        .where(eq(booking.id, bookingId));

      await notification.write({
        db: tx,
        userId: b.tutorId,
        bookingId,
        category: "booking",
        severity: "info",
        title: `Booking ${toState}`,
        body: `A student has ${toState} the booking.`,
        eventKey: `booking.${bookingId}.${toState}`,
      });

      return updated;
    });
  }

  async function tutorAccept(bookingId: string, tutorId: string) {
    const [b] = await db
      .select()
      .from(booking)
      .where(eq(booking.id, bookingId))
      .limit(1);
    if (!b) throw notFound("Booking not found");
    if (b.tutorId !== tutorId) throw forbidden("Not your booking");
    if (b.currentState !== "awaiting_tutor_review") {
      throw conflict("Booking is not awaiting tutor review");
    }

    const isOffline = b.modality === "offline";
    const toState: BookingState = isOffline
      ? "awaiting_admin_room_approval"
      : "confirmed";

    return db.transaction(async (tx) => {
      const updated = await transition(tx, bookingId, toState, {
        actorId: tutorId,
        actorType: "tutor",
      });

      if (!isOffline) {
        await meeting.createEvent(bookingId);
        await transition(tx, bookingId, "scheduled", {
          actorId: tutorId,
          actorType: "tutor",
          reason: "Meeting created automatically",
        });
      }

      await notification.write({
        db: tx,
        userId: b.proposerId,
        bookingId,
        category: "booking",
        severity: "action",
        title: "Booking accepted",
        body: isOffline
          ? "Tutor accepted. Waiting for admin room approval."
          : "Tutor accepted. Session scheduled.",
        eventKey: `booking.${bookingId}.accepted`,
      });

      return updated;
    });
  }

  async function tutorDecline(
    bookingId: string,
    tutorId: string,
    reason?: string,
  ) {
    const [b] = await db
      .select()
      .from(booking)
      .where(eq(booking.id, bookingId))
      .limit(1);
    if (!b) throw notFound("Booking not found");
    if (b.tutorId !== tutorId) throw forbidden("Not your booking");
    if (b.currentState !== "awaiting_tutor_review") {
      throw conflict("Booking is not awaiting tutor review");
    }

    return db.transaction(async (tx) => {
      if (b.holdAmount > 0) {
        await wallet.release(tx, {
          walletId: b.proposerId,
          amount: b.holdAmount,
          eventKey: `booking.${bookingId}.decline_release`,
          sourceReference: bookingId,
          actorType: "tutor",
          reason: reason ?? "Tutor declined",
        });
      }

      const updated = await transition(tx, bookingId, "declined", {
        actorId: tutorId,
        actorType: "tutor",
        reason,
      });

      await notification.write({
        db: tx,
        userId: b.proposerId,
        bookingId,
        category: "booking",
        severity: "info",
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
    const [b] = await db
      .select()
      .from(booking)
      .where(eq(booking.id, bookingId))
      .limit(1);
    if (!b) throw notFound("Booking not found");
    if (b.tutorId !== tutorId) throw forbidden("Not your booking");
    if (b.currentState !== "scheduled") {
      throw conflict("Only scheduled bookings can be completed");
    }

    return db.transaction(async (tx) => {
      await wallet.deduct(tx, {
        walletId: b.proposerId,
        amount: b.holdAmount,
        eventKey: `booking.${bookingId}.deduct`,
        sourceReference: bookingId,
        actorType: "tutor",
        reason: "Session completed",
      });

      const updated = await transition(tx, bookingId, "completed", {
        actorId: tutorId,
        actorType: "tutor",
      });

      await tx
        .update(booking)
        .set({ holdAmount: 0 })
        .where(eq(booking.id, bookingId));

      await notification.write({
        db: tx,
        userId: b.proposerId,
        bookingId,
        category: "booking",
        severity: "info",
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
    const b = await assertStudentBookingAccess(db, userId, bookingId);
    if (TERMINAL_STATES.includes(b.currentState as BookingState)) {
      throw conflict("Booking is already in a terminal state");
    }

    return db.transaction(async (tx) => {
      const updated = await transition(tx, bookingId, "reschedule_proposed", {
        actorId: userId,
        actorType: "student",
        reason,
        metadata: { proposedStartAt, proposedEndAt },
      });

      await tx.insert(bookingRescheduleProposal).values({
        bookingId,
        proposedBy: userId,
        proposedStartAt,
        proposedEndAt,
        status: "pending",
      });

      await notification.write({
        db: tx,
        userId: b.tutorId,
        bookingId,
        category: "booking",
        severity: "action",
        title: "Reschedule proposed",
        body: "Student proposed a new time for the booking.",
        eventKey: `booking.${bookingId}.reschedule_proposed`,
      });

      return updated;
    });
  }

  async function createGroup(proposerId: string, input: CreateGroupInput) {
    const profile = await db.query.tutorProfile.findFirst({
      where: and(
        eq(tutorProfile.userId, input.tutorId),
        eq(tutorProfile.onboardingStatus, "published"),
      ),
    });
    if (!profile) throw notFound("Tutor profile not found");

    const slot = await db.query.availabilitySlot.findFirst({
      where: and(
        eq(availabilitySlot.id, input.availabilitySlotId),
        eq(availabilitySlot.tutorId, input.tutorId),
        eq(availabilitySlot.isActive, true),
        gte(availabilitySlot.startDate, new Date()),
      ),
    });
    if (!slot) throw badRequest("Selected availability slot is not available");

    const size = input.targetGroupSize;
    const pricePerStudent = (profile.prices?.[String(size)] ?? 50) as number;
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
    const deadlineAt = new Date(Date.now() + 12 * 60 * 60 * 1000);

    return db.transaction(async (tx) => {
      await wallet.hold(tx, {
        walletId: w.id,
        amount: totalMarks,
        eventKey: `booking.${bookingId}.hold`,
        sourceReference: bookingId,
        actorType: "student",
        reason: "Hold Marks for group booking (proposer)",
      });

      const [b] = await tx
        .insert(booking)
        .values({
          id: bookingId,
          type: "group",
          modality: input.modality,
          tutorId: input.tutorId,
          proposerId,
          targetGroupSize: size,
          minConfirmedHeadcount: 2,
          confirmedHeadcount: 1,
          currentState: "awaiting_participant_confirmation",
          scheduledStartAt: input.scheduledStartAt,
          scheduledEndAt: input.scheduledEndAt,
          timezone: input.timezone,
          priceSnapshot,
          originalMarks: totalMarks,
          holdAmount: totalMarks,
          deadlineAt,
        })
        .returning();

      await tx.insert(bookingParticipant).values({
        bookingId,
        userId: proposerId,
        role: "proposer",
        confirmationState: "confirmed",
        heldAmount: totalMarks,
      });

      for (const inviteeId of input.inviteeUserIds) {
        await tx.insert(bookingParticipant).values({
          bookingId,
          userId: inviteeId,
          role: "invitee",
          confirmationState: "pending",
          heldAmount: 0,
        });
        await notification.write({
          db: tx,
          userId: inviteeId,
          bookingId,
          category: "booking",
          severity: "action",
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
        actorType: "student",
      });

      return b!;
    });
  }

  async function confirmInvite(userId: string, bookingId: string) {
    const [b] = await db
      .select()
      .from(booking)
      .where(eq(booking.id, bookingId))
      .limit(1);
    if (!b) throw notFound("Booking not found");
    if (b.currentState !== "awaiting_participant_confirmation") {
      throw conflict("Booking is not awaiting participant confirmation");
    }

    const [participant] = await db
      .select()
      .from(bookingParticipant)
      .where(
        and(
          eq(bookingParticipant.bookingId, bookingId),
          eq(bookingParticipant.userId, userId),
        ),
      )
      .limit(1);
    if (!participant) throw forbidden("You are not a participant");
    if (participant.role !== "invitee")
      throw badRequest("Only invitees confirm");
    if (participant.confirmationState !== "pending") {
      throw conflict("Invite already confirmed or declined");
    }

    const size = b.targetGroupSize;
    const pricePerStudent = (b.priceSnapshot?.perStudent ?? 50) as number;
    const holdAmount = pricePerStudent;

    const w = await wallet.getByUserId(db, userId);
    if (!w) throw notFound("Wallet not found");
    if (w.availableBalance < holdAmount) {
      throw conflict("Insufficient available Marks");
    }

    return db.transaction(async (tx) => {
      await wallet.hold(tx, {
        walletId: w.id,
        amount: holdAmount,
        eventKey: `booking.${bookingId}.hold.${userId}`,
        sourceReference: bookingId,
        actorType: "student",
        reason: "Hold Marks for group booking (invitee)",
      });

      await tx
        .update(bookingParticipant)
        .set({
          confirmationState: "confirmed",
          heldAmount: holdAmount,
          confirmedAt: new Date(),
        })
        .where(eq(bookingParticipant.id, participant.id));

      const newHeadcount = b.confirmedHeadcount + 1;
      await tx
        .update(booking)
        .set({ confirmedHeadcount: newHeadcount })
        .where(eq(booking.id, bookingId));

      if (newHeadcount >= b.targetGroupSize) {
        await transition(tx, bookingId, "awaiting_tutor_review", {
          actorId: userId,
          actorType: "student",
          reason: "Full headcount reached",
        });
        await notification.write({
          db: tx,
          userId: b.tutorId,
          bookingId,
          category: "booking",
          severity: "action",
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
    const [b] = await db
      .select()
      .from(booking)
      .where(eq(booking.id, bookingId))
      .limit(1);
    if (!b) throw notFound("Booking not found");
    if (b.currentState !== "awaiting_participant_confirmation") {
      throw conflict("Booking is not awaiting participant confirmation");
    }

    const [participant] = await db
      .select()
      .from(bookingParticipant)
      .where(
        and(
          eq(bookingParticipant.bookingId, bookingId),
          eq(bookingParticipant.userId, userId),
        ),
      )
      .limit(1);
    if (!participant) throw forbidden("You are not a participant");
    if (participant.role !== "invitee")
      throw badRequest("Only invitees decline");
    if (participant.confirmationState !== "pending") {
      throw conflict("Invite already confirmed or declined");
    }

    return db.transaction(async (tx) => {
      await tx
        .update(bookingParticipant)
        .set({
          confirmationState: "declined",
          declinedAt: new Date(),
          withdrawnReason: reason,
        })
        .where(eq(bookingParticipant.id, participant.id));

      return { declined: true };
    });
  }

  async function reconfirm(userId: string, bookingId: string, accept: boolean) {
    const [b] = await db
      .select()
      .from(booking)
      .where(eq(booking.id, bookingId))
      .limit(1);
    if (!b) throw notFound("Booking not found");
    if (b.currentState !== "awaiting_reconfirmation") {
      throw conflict("Booking is not awaiting reconfirmation");
    }

    const [participant] = await db
      .select()
      .from(bookingParticipant)
      .where(
        and(
          eq(bookingParticipant.bookingId, bookingId),
          eq(bookingParticipant.userId, userId),
        ),
      )
      .limit(1);
    if (!participant) throw forbidden("You are not a participant");

    return db.transaction(async (tx) => {
      if (accept) {
        await tx
          .update(bookingParticipant)
          .set({
            confirmationState: "reconfirmed",
            reconfirmedAt: new Date(),
          })
          .where(eq(bookingParticipant.id, participant.id));

        const reconfirmed = await db
          .select()
          .from(bookingParticipant)
          .where(
            and(
              eq(bookingParticipant.bookingId, bookingId),
              eq(bookingParticipant.confirmationState, "reconfirmed"),
            ),
          );

        const confirmedCount = await db
          .select()
          .from(bookingParticipant)
          .where(
            and(
              eq(bookingParticipant.bookingId, bookingId),
              inArray(bookingParticipant.confirmationState, [
                "confirmed",
                "reconfirmed",
              ]),
            ),
          );

        if (reconfirmed.length === confirmedCount.length) {
          await transition(tx, bookingId, "awaiting_tutor_review", {
            actorId: userId,
            actorType: "student",
            reason: "All reconfirmed",
          });
        }
        return { reconfirmed: true };
      } else {
        await tx
          .update(bookingParticipant)
          .set({ confirmationState: "declined", declinedAt: new Date() })
          .where(eq(bookingParticipant.id, participant.id));
        return { reconfirmed: false };
      }
    });
  }

  async function withdraw(userId: string, bookingId: string, reason?: string) {
    const b = await assertStudentBookingAccess(db, userId, bookingId);
    if (TERMINAL_STATES.includes(b.currentState as BookingState)) {
      throw conflict("Booking is already terminal");
    }

    const [participant] = await db
      .select()
      .from(bookingParticipant)
      .where(
        and(
          eq(bookingParticipant.bookingId, bookingId),
          eq(bookingParticipant.userId, userId),
        ),
      )
      .limit(1);
    if (!participant) throw forbidden("You are not a participant");

    const now = new Date();
    const h2 = new Date(b.scheduledStartAt.getTime() - 2 * 60 * 60 * 1000);
    const isLate = now > h2;
    const participantState = isLate
      ? ("withdrawn_post_h2" as const)
      : ("withdrawn_pre_h2" as const);

    return db.transaction(async (tx) => {
      if (participant.heldAmount > 0) {
        await wallet.release(tx, {
          walletId: b.proposerId,
          amount: participant.heldAmount,
          eventKey: `booking.${bookingId}.withdraw.${userId}`,
          sourceReference: bookingId,
          actorType: "student",
          reason: reason ?? "Withdrawal",
        });
      }

      await tx
        .update(bookingParticipant)
        .set({
          confirmationState: participantState,
          withdrawnAt: new Date(),
          withdrawnReason: reason,
        })
        .where(eq(bookingParticipant.id, participant.id));

      const remaining = await db
        .select()
        .from(bookingParticipant)
        .where(
          and(
            eq(bookingParticipant.bookingId, bookingId),
            ne(bookingParticipant.userId, userId),
            inArray(bookingParticipant.confirmationState, [
              "confirmed",
              "reconfirmed",
            ]),
          ),
        );

      if (b.type === "group" && remaining.length < 2) {
        await transition(tx, bookingId, "cancelled", {
          actorId: userId,
          actorType: "student",
          reason: "Not enough participants after withdrawal",
        });
      } else if (!isLate) {
        await transition(tx, bookingId, "awaiting_reconfirmation", {
          actorId: userId,
          actorType: "student",
          reason: "Participant withdrew before H-2",
        });
      }

      return { withdrawn: true, late: isLate };
    });
  }

  async function createSeries(proposerId: string, input: CreateSeriesInput) {
    const profile = await db.query.tutorProfile.findFirst({
      where: and(
        eq(tutorProfile.userId, input.tutorId),
        eq(tutorProfile.onboardingStatus, "published"),
      ),
    });
    if (!profile) throw notFound("Tutor profile not found");

    if (input.sessions.length < 2 || input.sessions.length > 4) {
      throw badRequest("Series must have 2-4 sessions");
    }

    const slot = await db.query.availabilitySlot.findFirst({
      where: and(
        eq(availabilitySlot.id, input.availabilitySlotId),
        eq(availabilitySlot.tutorId, input.tutorId),
        eq(availabilitySlot.isActive, true),
      ),
    });
    if (!slot) throw badRequest("Selected availability slot is not available");

    const pricePerStudent = (profile.prices?.["1"] ?? 50) as number;
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
        actorType: "student",
        reason: "Hold Marks for series booking",
      });

      const [b] = await tx
        .insert(booking)
        .values({
          id: bookingId,
          type: "series",
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
        })
        .returning();

      await tx.insert(bookingParticipant).values({
        bookingId,
        userId: proposerId,
        role: "proposer",
        confirmationState: "confirmed",
        heldAmount: totalMarks,
      });

      for (const session of input.sessions) {
        await tx.insert(bookingSession).values({
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
        actorType: "student",
      });

      return b!;
    });
  }

  async function listSessions(bookingId: string) {
    const b = await db.query.booking.findFirst({
      where: eq(booking.id, bookingId),
    });
    if (!b) throw notFound("Booking not found");
    if (b.type !== "series") throw badRequest("Booking is not a series");
    return db
      .select()
      .from(bookingSession)
      .where(eq(bookingSession.seriesBookingId, bookingId))
      .orderBy(bookingSession.scheduledStartAt);
  }

  async function expireBookings() {
    const now = new Date();
    const candidates = await db
      .select()
      .from(booking)
      .where(
        and(
          lte(booking.deadlineAt, now),
          inArray(booking.currentState, [
            "awaiting_participant_confirmation",
            "awaiting_reconfirmation",
            "awaiting_marks_hold",
            "awaiting_tutor_review",
          ]),
        ),
      );

    for (const b of candidates) {
      await db.transaction(async (tx) => {
        if (b.holdAmount > 0) {
          const w = await wallet.getByUserId(tx, b.proposerId);
          if (w) {
            await wallet.release(tx, {
              walletId: w.id,
              amount: b.holdAmount,
              eventKey: `booking.${b.id}.expire_release`,
              sourceReference: b.id,
              actorType: "system",
              reason: "Booking expired",
            });
          }
        }
        await transition(tx, b.id, "expired", {
          actorId: "system",
          actorType: "system",
          reason: "Deadline passed",
        });
      });
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
