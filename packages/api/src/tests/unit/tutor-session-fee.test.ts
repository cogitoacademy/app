import { describe, expect, test } from "bun:test";
import {
  buildTutorSessionFeeRecord,
  tutorSessionFeeEventKey,
} from "../../modules/booking/tutor-session-fee";
import type { BookingPriceSnapshot } from "@cogito-app/db/schema";

const earnedAt = new Date("2026-10-19T10:00:00.000Z");
const scheduledStartAt = new Date("2026-10-18T10:00:00.000Z");

const legacySnapshot: BookingPriceSnapshot = {
  perStudent: 42,
  baseline: 42,
  tutorShare: 30,
  cogitoTake: 12,
  baselineCogitoTake: 12,
  baselineTutorShare: 30,
  extraTotal: 0,
  cogitoExtraTake: 0,
  tutorExtraShare: 0,
};

describe("tutor session fee contract", () => {
  test("rejects old Marks and IDR snapshot formats", () => {
    for (const priceSnapshot of [
      legacySnapshot,
      { ...legacySnapshot, tutorHonorariumIdr: 185_000 },
      null,
    ]) {
      expect(() =>
        buildTutorSessionFeeRecord({
          bookingId: "booking-old",
          bookingSessionId: null,
          tutorId: "tutor-1",
          scheduledStartAt,
          earnedAt,
          priceSnapshot,
        }),
      ).toThrow("A V3 price snapshot is required");
    }
  });

  test("uses the V3 honorarium snapshot, not the Marks amount", () => {
    const snapshot: BookingPriceSnapshot = {
      engine: "v3",
      v3Revision: 7,
      competition: "competition-policy-debate",
      modality: "online",
      headcount: 2,
      perStudentMarks: 27,
      collectedMarks: 54,
      tutorHonorariumIdr: 153_000,
    };

    const record = buildTutorSessionFeeRecord({
      bookingId: "booking-3",
      bookingSessionId: "session-3",
      tutorId: "tutor-1",
      scheduledStartAt,
      earnedAt,
      priceSnapshot: snapshot,
    });

    expect(record).toMatchObject({
      eventKey: "tutor-session-fee:session:session-3",
      grossHonorariumIdr: 153_000,
      priceSnapshot: snapshot,
    });
    expect(tutorSessionFeeEventKey("booking-3", "session-3")).toBe(
      record.eventKey,
    );
  });

  test("rejects a V3 snapshot with no tutor honorarium", () => {
    const snapshot = {
      engine: "v3",
      v3Revision: 7,
      competition: "competition-policy-debate",
      modality: "online",
      headcount: 2,
      perStudentMarks: 27,
      collectedMarks: 54,
    } as unknown as BookingPriceSnapshot;

    expect(() =>
      buildTutorSessionFeeRecord({
        bookingId: "booking-v3-missing-fee",
        bookingSessionId: "session-v3-missing-fee",
        tutorId: "tutor-1",
        scheduledStartAt,
        earnedAt,
        priceSnapshot: snapshot,
      }),
    ).toThrow("V3 tutor honorarium");
  });

  test("rejects invalid V3 honoraria but preserves an explicit zero", () => {
    for (const amount of [Number.NaN, Number.POSITIVE_INFINITY, 1.5, -1]) {
      const snapshot = {
        engine: "v3",
        v3Revision: 7,
        competition: "competition-policy-debate",
        modality: "online",
        headcount: 2,
        perStudentMarks: 27,
        collectedMarks: 54,
        tutorHonorariumIdr: amount,
      } as BookingPriceSnapshot;

      expect(() =>
        buildTutorSessionFeeRecord({
          bookingId: "booking-v3-invalid-fee",
          bookingSessionId: "session-v3-invalid-fee",
          tutorId: "tutor-1",
          scheduledStartAt,
          earnedAt,
          priceSnapshot: snapshot,
        }),
      ).toThrow();
    }

    const zeroSnapshot: BookingPriceSnapshot = {
      engine: "v3",
      v3Revision: 7,
      competition: "competition-policy-debate",
      modality: "online",
      headcount: 2,
      perStudentMarks: 27,
      collectedMarks: 54,
      tutorHonorariumIdr: 0,
    };
    const zeroFee = buildTutorSessionFeeRecord({
      bookingId: "booking-v3-zero-fee",
      bookingSessionId: "session-v3-zero-fee",
      tutorId: "tutor-1",
      scheduledStartAt,
      earnedAt,
      priceSnapshot: zeroSnapshot,
    });
    expect(zeroFee.grossHonorariumIdr).toBe(0);
  });
});
