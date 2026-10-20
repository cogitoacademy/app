import type { BookingPriceSnapshot } from "@cogito-app/db/schema";
import { TUTOR_PAYOUT_RATE_IDR } from "../../shared/constants";

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
  const grossHonorariumIdr =
    priceSnapshot?.engine === "v3"
      ? priceSnapshot.tutorHonorariumIdr
      : (priceSnapshot?.tutorHonorariumIdr ??
        (priceSnapshot?.tutorShare ?? 0) * TUTOR_PAYOUT_RATE_IDR);

  if (!Number.isSafeInteger(grossHonorariumIdr) || grossHonorariumIdr < 0) {
    throw new RangeError(
      priceSnapshot?.engine === "v3"
        ? "V3 tutor honorarium must be a non-negative whole IDR amount"
        : "Tutor honorarium must be a non-negative whole IDR amount",
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
