import { BOOKING_STATE, TERMINAL_STATES } from "../booking/booking-state.types";
import {
  BookingNotFoundError,
  InvalidRefundStateError,
  TerminalStateOverrideError,
} from "./admin-booking.errors";
import {
  ACTOR_TYPE,
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
  NOTIFICATION_CATEGORY,
  NOTIFICATION_SEVERITY,
  PAYMENT_STATUS,
  RESPONSE_WINDOW_MS,
} from "../../shared/constants";
import type { DbType } from "../../lib/db";
import type { DbOrTx } from "../../lib/tx";
import type { AdminBookingRepo } from "./admin-booking.repo";
import { URGENCY_RANK, type UrgencyLevel } from "./admin-booking.repo";
import type {
  AdminBookingAuditPort,
  AdminBookingWalletPort,
  AdminBookingRefundPort,
  AdminBookingNotificationPort,
} from "./index";

export const OVERRIDE_CATEGORIES = [
  "tutor_no_show",
  "medical_emergency",
  "technical_failure",
  "admin_correction",
  "student_no_show",
  "force_cancel",
] as const;

export type OverrideCategory = (typeof OVERRIDE_CATEGORIES)[number];

export const MARKS_ACTIONS = [
  "release_holds",
  "compensate_credit",
  "compensate_deduct",
] as const;

export type MarksAction = (typeof MARKS_ACTIONS)[number];

const CATEGORY_STATE_MAP: Record<OverrideCategory, string> = {
  tutor_no_show: BOOKING_STATE.NO_SHOW,
  medical_emergency: BOOKING_STATE.CANCELLED,
  technical_failure: BOOKING_STATE.CANCELLED,
  admin_correction: BOOKING_STATE.CANCELLED,
  student_no_show: BOOKING_STATE.NO_SHOW,
  force_cancel: BOOKING_STATE.CANCELLED,
};

export interface WalletBalances {
  totalBalance: number;
  heldBalance: number;
  availableBalance: number;
}

export interface PerParticipantImpact {
  userId: string;
  participantId: string;
  heldAmount: number;
  walletId: string;
  action: MarksAction;
  before: WalletBalances;
  after: WalletBalances;
}

export interface OverrideInput {
  bookingId: string;
  category: OverrideCategory;
  reason: string;
  affectedParticipants?: string[];
  marksAction?: MarksAction;
  userNote?: string;
  internalNote?: string;
}

export type AdminBookingService = ReturnType<typeof createAdminBookingService>;

/**
 * A booking is escalated when it carries an active override record whose
 * overriddenAt timestamp is older than the 12h SLA response window. Computed
 * from booking.override_meta (no column added).
 */
function computeEscalated(overrideMeta: unknown): boolean {
  if (typeof overrideMeta !== "object" || overrideMeta === null) return false;
  const overriddenAt = (overrideMeta as Record<string, unknown>).overriddenAt;
  if (typeof overriddenAt !== "string") return false;
  const appliedAt = Date.parse(overriddenAt);
  if (Number.isNaN(appliedAt)) return false;
  return Date.now() - appliedAt > RESPONSE_WINDOW_MS;
}

function toOverrideQueueItem<T extends { overrideMeta: unknown }>(
  row: T,
): T & { escalated: boolean } {
  return { ...row, escalated: computeEscalated(row.overrideMeta) };
}

/** Composite keyset cursor: rank, scheduledStartAt, id. */
function toOverrideCursor(row: {
  id: string;
  currentState: string;
  scheduledStartAt: Date;
}): string {
  const rank = URGENCY_RANK[row.currentState] ?? 2;
  return `${rank}~${row.scheduledStartAt.toISOString()}~${row.id}`;
}



 * Creates the admin booking service for overrides, listing, history, and refunds.
 *
 * @param deps - the dependency ports (db, repo, auditPort, wallet, refund)
 * @returns an AdminBookingService with applyOverride/listBookings/getBookingStateHistory/adminRefund
 */
export function createAdminBookingService(deps: {
  db: DbType;
  repo: AdminBookingRepo;
  auditPort: AdminBookingAuditPort;
  wallet: AdminBookingWalletPort;
  refund: AdminBookingRefundPort;
  notification?: AdminBookingNotificationPort;
}) {
  const { db, repo, auditPort, wallet, refund, notification } = deps;

  function projectWalletAfter(
    w: WalletBalances,
    action: MarksAction,
    amount: number,
  ): WalletBalances {
    if (action === "release_holds") {
      return {
        totalBalance: w.totalBalance,
        heldBalance: Math.max(w.heldBalance - amount, 0),
        availableBalance: w.availableBalance + amount,
      };
    }
    if (action === "compensate_credit") {
      return {
        totalBalance: w.totalBalance + amount,
        heldBalance: w.heldBalance,
        availableBalance: w.availableBalance + amount,
      };
    }
    return {
      totalBalance: w.totalBalance - amount,
      heldBalance: w.heldBalance,
      availableBalance: w.availableBalance - amount,
    };
  }

  /**
   * Pure planning for an override: computes the projected target state and per
   * participant wallet impact WITHOUT writing anything. Shared by applyOverride
   * (which executes the plan) and previewOverride (which only reports it).
   */
  async function planOverride(
    conn: DbOrTx,
    bookingRow: { id: string; currentState: string; holdAmount: number },
    input: OverrideInput,

   * Applies an admin override to a booking, optionally releasing/compensating held Marks.
   *
   * @param adminId - the admin applying the override
   * @param input - the override details (bookingId, category, reason, marksAction, affectedParticipants)
   * @returns the updated booking
   * @throws {BookingNotFoundError} if the booking does not exist
   * @throws {TerminalStateOverrideError} if the booking is in a terminal state
   */
  async function applyOverride(
    adminId: string,
    input: {
      bookingId: string;
      category: OverrideCategory;
      reason: string;
      affectedParticipants?: string[];
      marksAction?: MarksAction;
      userNote?: string;
      internalNote?: string;
    },
  ) {
    const newState = CATEGORY_STATE_MAP[input.category];

    if (
      (TERMINAL_STATES as readonly string[]).includes(bookingRow.currentState)
    ) {
      throw new TerminalStateOverrideError(
        input.bookingId,
        bookingRow.currentState,
      );
    }

    const overrideMeta: Record<string, unknown> = {
      category: input.category,
      reason: input.reason,
      marksAction: input.marksAction,
      affectedParticipants: input.affectedParticipants,
      userNote: input.userNote,
      internalNote: input.internalNote,
      overriddenAt: new Date().toISOString(),
    };

    const participants = await repo.findParticipantsByBookingId(
      conn,
      input.bookingId,
    );
    const affectedParts =
      input.affectedParticipants && input.affectedParticipants.length > 0
        ? participants.filter((p) =>
            input.affectedParticipants!.includes(p.userId),
          )
        : [];

    const perParticipantImpact: PerParticipantImpact[] = [];
    if (input.marksAction && bookingRow.holdAmount > 0) {
      for (const participant of affectedParts) {
        if (participant.heldAmount <= 0) continue;
        // eslint-disable-next-line no-await-in-loop
        const participantWallet = await wallet.getByUserId(
          conn,
          participant.userId,
        );
        if (!participantWallet) continue;
        perParticipantImpact.push({
          userId: participant.userId,
          participantId: participant.id,
          heldAmount: participant.heldAmount,
          walletId: participantWallet.id,
          action: input.marksAction,
          before: {
            totalBalance: participantWallet.totalBalance,
            heldBalance: participantWallet.heldBalance,
            availableBalance: participantWallet.availableBalance,
          },
          after: projectWalletAfter(
            participantWallet,
            input.marksAction,
            participant.heldAmount,
          ),
        });
      }
    }

    return {
      newState,
      affectedParticipantIds: affectedParts.map((p) => p.userId),
      projectedMarksAction: input.marksAction ?? null,
      perParticipantImpact,
      overrideMeta,
    };
  }

  async function applyOverride(adminId: string, input: OverrideInput) {
    const result = await db.transaction(async (tx) => {
      const bookingRow = await repo.findBookingById(tx, input.bookingId);
      if (!bookingRow) throw new BookingNotFoundError(input.bookingId);

      const plan = await planOverride(tx, bookingRow, input);

      const updateResult = await repo.updateBookingWithOverride(
        tx,
        input.bookingId,
        plan.newState,
        input.reason,
        plan.overrideMeta,
      );
      if (!updateResult) throw new BookingNotFoundError(input.bookingId);

      await repo.insertStateHistoryEntry(tx, {
        bookingId: input.bookingId,
        fromState: updateResult.previousState,
        toState: plan.newState,
        reason: input.reason,
        actorId: adminId,
        actorType: ACTOR_TYPE.ADMIN,
        metadata: plan.overrideMeta,
      });

      let totalReleased = 0;

      for (const impact of plan.perParticipantImpact) {
        if (impact.action === "release_holds") {
          // eslint-disable-next-line no-await-in-loop
          await wallet.release(tx, {
            walletId: impact.walletId,
            amount: impact.heldAmount,
            eventKey: `override.release.${input.bookingId}.${impact.participantId}`,
            actorType: ACTOR_TYPE.ADMIN,
            reason: `Admin override: ${input.reason}`,
            bookingId: input.bookingId,
          });
          totalReleased += impact.heldAmount;
        } else if (impact.action === "compensate_credit") {
          // eslint-disable-next-line no-await-in-loop
          await wallet.compensate(tx, {
            walletId: impact.walletId,
            amount: impact.heldAmount,
            eventKey: `override.compensate_credit.${input.bookingId}.${impact.participantId}`,
            actorType: ACTOR_TYPE.ADMIN,
            reason: `Admin override credit: ${input.reason}`,
            type: "compensate_credit",
            bookingId: input.bookingId,
          });
          totalReleased += impact.heldAmount;
        } else if (impact.action === "compensate_deduct") {
          // eslint-disable-next-line no-await-in-loop
          await wallet.compensate(tx, {
            walletId: impact.walletId,
            amount: impact.heldAmount,
            eventKey: `override.compensate_deduct.${input.bookingId}.${impact.participantId}`,
            actorType: ACTOR_TYPE.ADMIN,
            reason: `Admin override deduct: ${input.reason}`,
            type: "compensate_deduct",
            bookingId: input.bookingId,
          });
          totalReleased += impact.heldAmount;
        }
      }

      if (totalReleased > 0) {
        await repo.updateBookingHoldAmount(tx, input.bookingId, 0);
      }

      if (notification) {
        for (const userId of plan.affectedParticipantIds) {
          // eslint-disable-next-line no-await-in-loop
          await notification.writeBestEffort({
            db: tx,
            userId,
            bookingId: input.bookingId,
            category: NOTIFICATION_CATEGORY.OVERRIDE,
            severity: NOTIFICATION_SEVERITY.ACTION,
            title: "Your booking was updated by an admin",
            body: `Your booking was updated (${input.category})${
              input.userNote ? `: ${input.userNote}` : ""
            }.`,
            eventKey: `override.applied.${input.bookingId}.${userId}`,
          });
        }
      }

      await auditPort.record({
        db: tx,
        actorId: adminId,
        actorType: ACTOR_TYPE.ADMIN,
        action: "booking_override",
        targetId: input.bookingId,
        targetType: "booking",
        beforeState: { currentState: updateResult.previousState },
        afterState: { currentState: plan.newState, overrideMeta: plan.overrideMeta },
      });

      return updateResult.updated;
    });

    return result;
  }

  /** Returns the projected override outcome without persisting anything. */
  async function previewOverride(input: OverrideInput) {
    const bookingRow = await repo.findBookingById(db, input.bookingId);
    if (!bookingRow) throw new BookingNotFoundError(input.bookingId);

    const plan = await planOverride(db, bookingRow, input);

    return {
      bookingId: input.bookingId,
      currentState: bookingRow.currentState,
      projectedState: plan.newState,
      affectedParticipants: plan.affectedParticipantIds,
      marksAction: plan.projectedMarksAction,
      perParticipantImpact: plan.perParticipantImpact,
    };
  }

  /**
   * Lists bookings for the admin, by bookingId or with cursor pagination.
   *
   * @param opts - list options (bookingId, limit, cursor)
   * @returns the booking items and a nextCursor when more pages exist
   */
  async function listBookings(opts?: {
    bookingId?: string;
    limit?: number;
    cursor?: string;
    category?: OverrideCategory;
    urgency?: UrgencyLevel;
    escalated?: boolean;
  }) {
    if (opts?.bookingId) {
      const bookingRow = await repo.findBookingById(db, opts.bookingId);
      return {
        items: bookingRow ? [toOverrideQueueItem(bookingRow)] : [],
        nextCursor: null,
      };
    }
    const limit = Math.min(opts?.limit ?? DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT);
    const filters = {
      category: opts?.category,
      urgency: opts?.urgency,
      escalated: opts?.escalated,
    };
    const hasFilters =
      filters.category !== undefined ||
      filters.urgency !== undefined ||
      filters.escalated !== undefined;
    const rows = hasFilters
      ? await repo.listBookingsByState(db, [], limit, opts?.cursor, filters)
      : await repo.listBookingsByState(db, [], limit, opts?.cursor);
    const items = rows.slice(0, limit).map(toOverrideQueueItem);
    const nextCursor =
      rows.length > limit ? toOverrideCursor(items[items.length - 1]!) : null;
    return { items, nextCursor };
  }

  /**
   * Fetches the state history for a booking.
   *
   * @param bookingId - the booking to inspect
   * @returns the chronological state history entries
   * @throws {BookingNotFoundError} if the booking does not exist
   */
  async function getBookingStateHistory(bookingId: string) {
    const bookingRow = await repo.findBookingById(db, bookingId);
    if (!bookingRow) throw new BookingNotFoundError(bookingId);

    return repo.getStateHistory(db, bookingId);
  }

  /**
   * Processes an admin refund: credits the payer's wallet, marks the payment REFUNDED, and records the refund.
   *
   * @param adminId - the admin processing the refund
   * @param input - the refund details (paymentId, reason)
   * @returns a confirmation with the payment id and "refunded" status
   * @throws {BookingNotFoundError} if the payment or payer wallet is not found
   * @throws {InvalidRefundStateError} if the payment is not PAID or SETTLED
   */
  async function adminRefund(
    adminId: string,
    input: { paymentId: string; reason: string },
  ) {
    const payment = await repo.findPaymentById(db, input.paymentId);
    if (!payment) throw new BookingNotFoundError(input.paymentId);

    if (
      payment.status !== PAYMENT_STATUS.PAID &&
      payment.status !== PAYMENT_STATUS.SETTLED
    ) {
      throw new InvalidRefundStateError(input.paymentId, payment.status);
    }

    return db.transaction(async (tx) => {
      const participantWallet = await wallet.getByUserId(tx, payment.userId);
      if (!participantWallet) throw new BookingNotFoundError(payment.userId);

      await wallet.compensate(tx, {
        walletId: participantWallet.id,
        amount: payment.marks,
        eventKey: `refund.${payment.id}`,
        sourceReference: payment.id,
        actorType: ACTOR_TYPE.ADMIN,
        reason: `Admin refund: ${input.reason}`,
        type: "compensate_credit",
      });

      await repo.updatePaymentStatus(
        tx,
        input.paymentId,
        PAYMENT_STATUS.REFUNDED,
      );

      await refund.createRefundRecord(tx, {
        paymentId: input.paymentId,
        walletId: participantWallet.id,
        amountIdr: payment.amountIdr ?? 0,
        marks: payment.marks,
        reason: input.reason,
        actorId: adminId,
      });

      await auditPort.record({
        db: tx,
        actorId: adminId,
        actorType: ACTOR_TYPE.ADMIN,
        action: "admin_refund",
        targetId: input.paymentId,
        targetType: "payment_record",
        beforeState: { status: payment.status },
        afterState: { status: "REFUNDED", reason: input.reason },
      });

      return { paymentId: input.paymentId, status: "refunded" };
    });
  }

  return {
    applyOverride,
    previewOverride,
    listBookings,
    getBookingStateHistory,
    adminRefund,
  };
}
