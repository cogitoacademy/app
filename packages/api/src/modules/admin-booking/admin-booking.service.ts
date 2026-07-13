import { badRequest, notFound } from "../../lib/errors";
import {
  ACTOR_TYPE,
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
  PAYMENT_STATUS,
} from "../../shared/constants";
import { TERMINAL_STATES } from "../booking/booking-state.types";
import type { DbType } from "../../lib/db";
import type { AuditPort } from "../../shared/ports/audit.port";
import type { WalletPort } from "../../shared/ports/wallet.port";
import type { AdminBookingRepo } from "./admin-booking.repo";

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
  tutor_no_show: "no_show",
  medical_emergency: "cancelled",
  technical_failure: "cancelled",
  admin_correction: "cancelled",
  student_no_show: "no_show",
  force_cancel: "cancelled",
};

export type AdminBookingService = ReturnType<typeof createAdminBookingService>;

export function createAdminBookingService(deps: {
  db: DbType;
  repo: AdminBookingRepo;
  auditPort: AuditPort;
  wallet: WalletPort;
}) {
  const { db, repo, auditPort, wallet } = deps;

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
      if (!bookingRow) throw notFound("Booking not found");

      if (
        (TERMINAL_STATES as readonly string[]).includes(bookingRow.currentState)
      ) {
        throw badRequest("Cannot override a terminal booking state");
      }

      const updateResult = await repo.updateBookingWithOverride(
        tx,
        input.bookingId,
        newState,
        input.reason,
        overrideMeta,
      );
      if (!updateResult) throw notFound("Booking not found");

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
          }
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
    return { items: rows.slice(0, limit), nextCursor: null };
  }

  async function getBookingStateHistory(bookingId: string) {
    const bookingRow = await repo.findBookingById(db, bookingId);
    if (!bookingRow) throw notFound("Booking not found");

    return repo.getStateHistory(db, bookingId);
  }

  async function adminRefund(
    adminId: string,
    input: { paymentId: string; reason: string },
  ) {
    const payment = await repo.findPaymentById(db, input.paymentId);
    if (!payment) throw notFound("Payment not found");

    if (
      payment.status !== PAYMENT_STATUS.PAID &&
      payment.status !== PAYMENT_STATUS.SETTLED
    ) {
      throw badRequest("Only PAID or SETTLED payments can be refunded");
    }

    return db.transaction(async (tx) => {
      const participantWallet = await wallet.getByUserId(tx, payment.userId);
      if (!participantWallet) throw notFound("Wallet not found");

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
