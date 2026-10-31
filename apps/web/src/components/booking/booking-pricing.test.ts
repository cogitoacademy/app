import { describe, expect, test } from "bun:test";
import {
  getBookingPriceSummary,
  getTotalHonorariumIdr,
  getPerSessionHonorariumIdr,
  getSeriesSessionCount,
} from "./booking-pricing";

describe("getBookingPriceSummary", () => {
  test("requires the temporary target-headcount hold for a one-session group", () => {
    expect(
      getBookingPriceSummary({
        perStudentPrice: 45,
        sessionCount: 1,
        isGroupBooking: true,
        groupSize: 3,
        isGroupSeries: false,
      }),
    ).toEqual({ displayPrice: 45, requiredHold: 135 });
  });

  test("requires only the proposer's package for a group series", () => {
    expect(
      getBookingPriceSummary({
        perStudentPrice: 45,
        sessionCount: 4,
        isGroupBooking: true,
        groupSize: 3,
        isGroupSeries: true,
      }),
    ).toEqual({ displayPrice: 180, requiredHold: 180 });
  });

  test("uses the session total for solo series", () => {
    expect(
      getBookingPriceSummary({
        perStudentPrice: 42,
        sessionCount: 3,
        isGroupBooking: false,
        groupSize: 1,
        isGroupSeries: false,
      }),
    ).toEqual({ displayPrice: 126, requiredHold: 126 });
  });
});

const snapshot = {
  engine: "v3" as const,
  perStudentMarks: 45,
  tutorHonorariumIdr: 175_000,
};

describe("V3 honorarium summaries", () => {
  test("reads the pinned IDR fee, never a Marks conversion", () => {
    expect(
      getTotalHonorariumIdr({
        type: "solo",
        originalMarks: 45,
        priceSnapshot: snapshot,
      }),
    ).toBe(175_000);
  });
  test("sums the actual snapshots of all loaded sessions", () => {
    expect(
      getTotalHonorariumIdr(
        { type: "series", originalMarks: 180, priceSnapshot: snapshot },
        [
          { priceSnapshot: snapshot },
          { priceSnapshot: { ...snapshot, tutorHonorariumIdr: 200_000 } },
        ],
      ),
    ).toBe(375_000);
  });
  test("does not guess a series total or count from original Marks after repricing", () => {
    const booking = {
      type: "series",
      originalMarks: 180,
      priceSnapshot: { ...snapshot, perStudentMarks: 25 },
    };
    expect(getTotalHonorariumIdr(booking)).toBeNull();
    expect(getSeriesSessionCount(booking)).toBeNull();
    expect(
      getSeriesSessionCount(booking, [
        { priceSnapshot: snapshot },
        { priceSnapshot: snapshot },
      ]),
    ).toBe(2);
  });
  test("missing, old and invalid snapshots are unavailable, not Rp0", () => {
    for (const value of [
      null,
      { tutorHonorariumIdr: 175_000 },
      { ...snapshot, tutorHonorariumIdr: -1 },
      { ...snapshot, tutorHonorariumIdr: 1.5 },
    ]) {
      expect(getPerSessionHonorariumIdr(value)).toBeNull();
    }
    expect(
      getPerSessionHonorariumIdr({ ...snapshot, tutorHonorariumIdr: 0 }),
    ).toBe(0);
    expect(
      getTotalHonorariumIdr(
        { type: "series", originalMarks: 90, priceSnapshot: snapshot },
        [{ priceSnapshot: snapshot }, { priceSnapshot: null }],
      ),
    ).toBeNull();
  });
});
