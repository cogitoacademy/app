import { describe, expect, test } from "bun:test";
import { getBookingPriceSummary } from "./booking-pricing";

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
