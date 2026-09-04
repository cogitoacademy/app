import { BOOKING_STATE, type BookingState } from "./booking-state.types";

/**
 * Pure helpers for the booking module — no DB, no ports, no side effects.
 * Kept separate from `booking.service.ts` (the closure-heavy factory) so the
 * money-critical state machine stays readable and these stay unit-testable
 * in isolation.
 */

export const NON_BCA_TRANSFER_FEE_IDR = 2_500;

export function getTutorPayoutTransferFeeIdr(bankName: string): number {
  return bankName.trim().toUpperCase() === "BCA" ? 0 : NON_BCA_TRANSFER_FEE_IDR;
}

export type MeetingStatus = "pending" | "ready" | "failed";

export function computeMeetingInfo(b: {
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

/**
 * Terminal target per expiry-eligible state. Shared by `expireBookings` and
 * `releaseExpiredHolds` so both jobs agree on where a past-deadline booking
 * ends up (M4). RESCHEDULE_PROPOSED is handled by the proposal-expiry branch
 * in `expireBookings` (targets the pre-proposal state) and is deliberately
 * absent here.
 */
export const EXPIRY_TARGET: Record<string, BookingState> = {
  [BOOKING_STATE.SCHEDULED]: BOOKING_STATE.NO_SHOW,
  [BOOKING_STATE.AWAITING_ADMIN_ROOM_APPROVAL]: BOOKING_STATE.CANCELLED,
};
