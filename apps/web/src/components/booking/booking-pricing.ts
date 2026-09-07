const LEGACY_TUTOR_PAYOUT_RATE_IDR = 7_000;

export type HonorariumSnapshotInput = {
  perStudent?: number;
  tutorShare?: number;
  tutorHonorariumIdr?: number;
} | null;

export type HonorariumBookingInput = {
  type: string;
  originalMarks: number;
  priceSnapshot: HonorariumSnapshotInput;
};

export type HonorariumSessionInput = {
  priceSnapshot: HonorariumSnapshotInput;
};

export type BookingPriceSummaryInput = {
  perStudentPrice: number;
  sessionCount: number;
  isGroupBooking: boolean;
  groupSize: number;
  isGroupSeries: boolean;
};

export type BookingPriceSummary = {
  /** The amount shown to the student for their share of the booking. */
  displayPrice: number;
  /** The balance required before the booking request can be submitted. */
  requiredHold: number;
};

/**
 * Mirrors the booking service's initial hold rules.
 *
 * A one-session group temporarily holds the target headcount total from the
 * proposer, then releases the excess as invitees confirm. A group series only
 * holds the proposer's own per-session package up front.
 */
export function getBookingPriceSummary({
  perStudentPrice,
  sessionCount,
  isGroupBooking,
  groupSize,
  isGroupSeries,
}: BookingPriceSummaryInput): BookingPriceSummary {
  const sessions = Math.max(sessionCount, 1);
  const displayPrice = perStudentPrice * sessions;
  const requiredHold =
    isGroupBooking && !isGroupSeries ? displayPrice * groupSize : displayPrice;

  return { displayPrice, requiredHold };
}

function getPerSessionHonorariumIdr(snapshot: HonorariumSnapshotInput): number {
  if (snapshot?.tutorHonorariumIdr != null) return snapshot.tutorHonorariumIdr;
  return (snapshot?.tutorShare ?? 0) * LEGACY_TUTOR_PAYOUT_RATE_IDR;
}

/**
 * Derives the series session count. Prefers the loaded session rows, then
 * falls back to originalMarks / perStudent (booking.priceSnapshot stores one
 * session for series bookings).
 */
export function getSeriesSessionCount(
  booking: HonorariumBookingInput,
  sessions?: HonorariumSessionInput[] | null,
): number {
  if (sessions && sessions.length > 0) return sessions.length;
  if (booking.type !== "series") return 1;
  const perStudent = booking.priceSnapshot?.perStudent ?? 0;
  if (perStudent > 0 && booking.originalMarks > 0) {
    return Math.max(1, Math.round(booking.originalMarks / perStudent));
  }
  return 1;
}

/**
 * Totals tutor honorarium across series sessions. Single bookings return the
 * per-session snapshot. Series bookings sum each session snapshot (legacy
 * tutorShare * 7000 fallback), or booking snapshot * derived session count
 * when session rows are unavailable.
 */
export function getTotalHonorariumIdr(
  booking: HonorariumBookingInput,
  sessions?: HonorariumSessionInput[] | null,
): number {
  if (booking.type !== "series") {
    return getPerSessionHonorariumIdr(booking.priceSnapshot);
  }
  if (sessions && sessions.length > 0) {
    return sessions.reduce((total, session) => {
      const snapshot = session.priceSnapshot ?? booking.priceSnapshot;
      return total + getPerSessionHonorariumIdr(snapshot);
    }, 0);
  }
  return (
    getPerSessionHonorariumIdr(booking.priceSnapshot) *
    getSeriesSessionCount(booking, sessions)
  );
}
