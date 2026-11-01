import type { BookingPriceSnapshot } from "@cogito-app/db/schema";

export interface TutorSessionFeeRecordInput {
  bookingId: string;
  bookingSessionId: string | null;
  tutorId: string;
  scheduledStartAt: Date;
  earnedAt: Date;
  priceSnapshot: BookingPriceSnapshot | null;
}

export function tutorSessionFeeEventKey(
  bookingId: string,
  bookingSessionId: string | null,
): string {
  return bookingSessionId
    ? `tutor-session-fee:session:${bookingSessionId}`
    : `tutor-session-fee:booking:${bookingId}`;
}

export function buildTutorSessionFeeRecord({
  bookingId,
  bookingSessionId,
  tutorId,
  scheduledStartAt,
  earnedAt,
  priceSnapshot,
}: TutorSessionFeeRecordInput) {
  if (priceSnapshot?.engine !== "v3") {
    throw new RangeError(
      "A V3 price snapshot is required for a tutor session fee",
    );
  }
  const grossHonorariumIdr = priceSnapshot.tutorHonorariumIdr;
  if (!Number.isSafeInteger(grossHonorariumIdr) || grossHonorariumIdr < 0) {
    throw new RangeError(
      "V3 tutor honorarium must be a non-negative whole IDR amount",
    );
  }

  return {
    bookingId,
    bookingSessionId,
    tutorId,
    scheduledStartAt,
    earnedAt,
    eventKey: tutorSessionFeeEventKey(bookingId, bookingSessionId),
    grossHonorariumIdr,
    priceSnapshot,
  };
}
