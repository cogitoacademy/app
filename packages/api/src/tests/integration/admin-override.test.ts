import { describe, expect, test, beforeAll } from "bun:test";

import { services } from "../../services";
import { resetDatabase } from "../helpers/test-client";

describe("Admin Override", () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  test("override on non-existent booking returns not found", async () => {
    try {
      await services.adminBooking.applyOverride("admin-test-1", {
        bookingId: "nonexistent-booking-id",
        category: "force_cancel",
        reason: "Force cancel",
        affectedParticipants: [],
      });
      expect.unreachable("Should have thrown");
    } catch (err: any) {
      expect(err.message).toContain("not found");
    }
  });

  test("list bookings returns paginated result", async () => {
    const result = await services.adminBooking.listBookings({ limit: 10 });
    expect(result).toBeDefined();
    expect(Array.isArray(result.items)).toBe(true);
  });

  test("getBookingStateHistory on non-existent booking returns not found", async () => {
    try {
      await services.adminBooking.getBookingStateHistory("nonexistent-id");
      expect.unreachable("Should have thrown");
    } catch (err: any) {
      expect(err.message).toContain("not found");
    }
  });

  test("adminRefund on non-existent payment returns not found", async () => {
    try {
      await services.adminBooking.adminRefund("admin-test-2", {
        paymentId: "nonexistent-payment",
        reason: "Test refund",
      });
      expect.unreachable("Should have thrown");
    } catch (err: any) {
      expect(err.message).toContain("not found");
    }
  });
});
