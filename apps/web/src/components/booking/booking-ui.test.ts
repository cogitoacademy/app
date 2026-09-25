import { describe, expect, test } from "bun:test";
import { formatBookingDate } from "./booking-ui";

describe("formatBookingDate", () => {
  test("uses WIB for Jakarta booking times", () => {
    expect(formatBookingDate("2026-09-08T04:00:00.000Z", "Asia/Jakarta")).toBe(
      "Tue, 8 Sept 2026, 11:00 WIB",
    );
  });

  test("keeps Intl timezone labels for non-Jakarta zones", () => {
    expect(formatBookingDate("2026-09-08T04:00:00.000Z", "UTC")).toContain(
      "UTC",
    );
  });
});
