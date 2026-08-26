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
