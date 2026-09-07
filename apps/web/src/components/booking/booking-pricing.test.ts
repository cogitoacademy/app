import { describe, expect, test } from "bun:test";
import {
  getBookingPriceSummary,
  getTotalHonorariumIdr,
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

describe("getTotalHonorariumIdr", () => {
  test("returns the per-session honorarium for a single booking", () => {
    expect(
      getTotalHonorariumIdr({
        type: "solo",
        originalMarks: 45,
        priceSnapshot: {
          perStudent: 45,
          tutorShare: 36,
          tutorHonorariumIdr: 175_000,
        },
      }),
    ).toBe(175_000);
  });

  test("sums session snapshots for a series booking", () => {
    expect(
      getTotalHonorariumIdr(
        {
          type: "series",
          originalMarks: 180,
          priceSnapshot: {
            perStudent: 45,
            tutorShare: 36,
            tutorHonorariumIdr: 175_000,
          },
        },
        [
          { priceSnapshot: { tutorHonorariumIdr: 175_000, tutorShare: 36 } },
          { priceSnapshot: { tutorHonorariumIdr: 175_000, tutorShare: 36 } },
          { priceSnapshot: { tutorHonorariumIdr: 175_000, tutorShare: 36 } },
          { priceSnapshot: { tutorHonorariumIdr: 175_000, tutorShare: 36 } },
        ],
      ),
    ).toBe(700_000);
  });

  test("falls back to tutorShare * 7000 for legacy session snapshots", () => {
    expect(
      getTotalHonorariumIdr(
        {
          type: "series",
          originalMarks: 90,
          priceSnapshot: { perStudent: 45, tutorShare: 36 },
        },
        [
          { priceSnapshot: { tutorShare: 36 } },
          { priceSnapshot: { tutorShare: 36 } },
        ],
      ),
    ).toBe(36 * 7_000 * 2);
  });

  test("falls back to booking snapshot times derived session count when sessions are unavailable", () => {
    expect(
      getTotalHonorariumIdr({
        type: "series",
        originalMarks: 180,
        priceSnapshot: {
          perStudent: 45,
          tutorShare: 36,
          tutorHonorariumIdr: 175_000,
        },
      }),
    ).toBe(175_000 * 4);
  });

  test("falls back to legacy booking snapshot times derived session count", () => {
    expect(
      getTotalHonorariumIdr({
        type: "series",
        originalMarks: 135,
        priceSnapshot: { perStudent: 45, tutorShare: 30 },
      }),
    ).toBe(30 * 7_000 * 3);
  });
});
