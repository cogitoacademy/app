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
  PAYMENT_STATUS,
} from "../../shared/constants";
import type { DbType } from "../../lib/db";
import type { AdminBookingRepo } from "./admin-booking.repo";
import type {
  AdminBookingAuditPort,
  AdminBookingWalletPort,
  AdminBookingRefundPort,
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

export type AdminBookingService = ReturnType<typeof createAdminBookingService>;

export function createAdminBookingService(deps: {
  db: DbType;
  repo: AdminBookingRepo;
  auditPort: AdminBookingAuditPort;
  wallet: AdminBookingWalletPort;
  refund: AdminBookingRefundPort;
}) {
  const { db, repo, auditPort, wallet, refund } = deps;

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

    const overrideMeta: Record<string, unknown> = {
      category: input.category,
      reason: input.reason,
      marksAction: input.marksAction,
      affectedParticipants: input.affectedParticipants,
      userNote: input.userNote,
      internalNote: input.internalNote,
      overriddenAt: new Date().toISOString(),
    };

    const result = await db.transaction(async (tx) => {
      const bookingRow = await repo.findBookingById(tx, input.bookingId);
      if (!bookingRow) throw new BookingNotFoundError(input.bookingId);

      if (
        (TERMINAL_STATES as readonly string[]).includes(bookingRow.currentState)
      ) {
        throw new TerminalStateOverrideError(
          input.bookingId,
          bookingRow.currentState,
        );
      }

      const updateResult = await repo.updateBookingWithOverride(
        tx,
        input.bookingId,
        newState,
        input.reason,
        overrideMeta,
      );
      if (!updateResult) throw new BookingNotFoundError(input.bookingId);

      await repo.insertStateHistoryEntry(tx, {
        bookingId: input.bookingId,
        fromState: updateResult.previousState,
        toState: newState,
        reason: input.reason,
        actorId: adminId,
        actorType: ACTOR_TYPE.ADMIN,
        metadata: overrideMeta,
      });

      if (
        input.marksAction &&
        bookingRow.holdAmount > 0 &&
        input.affectedParticipants &&
        input.affectedParticipants.length > 0
      ) {
        const participants = await repo.findParticipantsByBookingId(
          tx,
          input.bookingId,
        );
        const affectedParts = participants.filter((p) =>
          input.affectedParticipants!.includes(p.userId),
        );

        let totalReleased = 0;

        for (const participant of affectedParts) {
          // eslint-disable-next-line no-await-in-loop
          const participantWallet = await wallet.getByUserId(
            tx,
            participant.userId,
          );
          if (!participantWallet) continue;

          if (
            input.marksAction === "release_holds" &&
            participant.heldAmount > 0
          ) {
            // eslint-disable-next-line no-await-in-loop
            await wallet.release(tx, {
              walletId: participantWallet.id,
              amount: participant.heldAmount,
              eventKey: `override.release.${input.bookingId}.${participant.id}`,
              actorType: ACTOR_TYPE.ADMIN,
              reason: `Admin override: ${input.reason}`,
              bookingId: input.bookingId,
            });
            totalReleased += participant.heldAmount;
          } else if (input.marksAction === "compensate_credit") {
            // eslint-disable-next-line no-await-in-loop
            await wallet.compensate(tx, {
              walletId: participantWallet.id,
              amount: participant.heldAmount || bookingRow.holdAmount,
              eventKey: `override.compensate_credit.${input.bookingId}.${participant.id}`,
              actorType: ACTOR_TYPE.ADMIN,
              reason: `Admin override credit: ${input.reason}`,
              type: "compensate_credit",
              bookingId: input.bookingId,
            });
            totalReleased += participant.heldAmount;
          } else if (input.marksAction === "compensate_deduct") {
            // eslint-disable-next-line no-await-in-loop
            await wallet.compensate(tx, {
              walletId: participantWallet.id,
              amount: participant.heldAmount || bookingRow.holdAmount,
              eventKey: `override.compensate_deduct.${input.bookingId}.${participant.id}`,
              actorType: ACTOR_TYPE.ADMIN,
              reason: `Admin override deduct: ${input.reason}`,
              type: "compensate_deduct",
              bookingId: input.bookingId,
            });
            totalReleased += participant.heldAmount;
          }
        }

        if (totalReleased > 0) {
          await repo.updateBookingHoldAmount(tx, input.bookingId, 0);
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
        afterState: { currentState: newState, overrideMeta },
      });

      return updateResult.updated;
    });

    return result;
  }

  async function listBookings(opts?: {
    bookingId?: string;
    limit?: number;
    cursor?: string;
  }) {
    if (opts?.bookingId) {
      const bookingRow = await repo.findBookingById(db, opts.bookingId);
      return { items: bookingRow ? [bookingRow] : [], nextCursor: null };
    }
    const limit = Math.min(opts?.limit ?? DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT);
    const rows = await repo.listBookingsByState(db, [], limit);
    const items = rows.slice(0, limit);
    const nextCursor = rows.length > limit ? items[items.length - 1]!.id : null;
    return { items, nextCursor };
  }

  async function getBookingStateHistory(bookingId: string) {
    const bookingRow = await repo.findBookingById(db, bookingId);
    if (!bookingRow) throw new BookingNotFoundError(bookingId);

    return repo.getStateHistory(db, bookingId);
  }

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

  return { applyOverride, listBookings, getBookingStateHistory, adminRefund };
}
