export type HonorariumSnapshotInput = {
  engine?: "v3";
  perStudentMarks?: number;
  tutorHonorariumIdr?: number;
} | null;
export type HonorariumBookingInput = {
  type: string;
  originalMarks: number;
  priceSnapshot: HonorariumSnapshotInput;
};
export type HonorariumSessionInput = { priceSnapshot: HonorariumSnapshotInput };

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

/** Missing or old snapshots must never be displayed as zero-valued fees. */
export function getPerSessionHonorariumIdr(
  snapshot: HonorariumSnapshotInput,
): number | null {
  const fee = snapshot?.tutorHonorariumIdr;
  return snapshot?.engine === "v3" &&
    typeof fee === "number" &&
    Number.isSafeInteger(fee) &&
    fee >= 0
    ? fee
    : null;
}
/** Session counts cannot be inferred from Marks after group repricing. */
export function getSeriesSessionCount(
  booking: HonorariumBookingInput,
  sessions?: HonorariumSessionInput[] | null,
): number | null {
  if (booking.type !== "series") return 1;
  return sessions?.length ? sessions.length : null;
}
export function getTotalHonorariumIdr(
  booking: HonorariumBookingInput,
  sessions?: HonorariumSessionInput[] | null,
): number | null {
  if (booking.type !== "series")
    return getPerSessionHonorariumIdr(booking.priceSnapshot);
  if (!sessions?.length) return null;
  const fees = sessions.map((session) =>
    getPerSessionHonorariumIdr(session.priceSnapshot),
  );
  if (fees.some((fee) => fee === null)) return null;
  return fees.reduce<number>((total, fee) => total + fee!, 0);
}
