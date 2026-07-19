import { describe, test, expect, mock } from "bun:test";
import { adminBookingHandlers } from "../../modules/admin-booking/admin-booking.handlers";

describe("adminBookingHandlers", () => {
  describe("applyOverride", () => {
    test("calls adminBooking.applyOverride with session user id and input", async () => {
      const applyOverride = mock(async () => ({ ok: true }));
      const context = {
        session: { user: { id: "admin1" } },
        services: { adminBooking: { applyOverride } },
      };
      const input = { bookingId: "b1", reason: "admin override" };

      const result = await adminBookingHandlers.applyOverride({
        context,
        input,
      });

      expect(applyOverride).toHaveBeenCalledWith("admin1", input);
      expect(result).toEqual({ ok: true });
    });
  });

  describe("listBookings", () => {
    test("calls adminBooking.listBookings with input", async () => {
      const listBookings = mock(async () => ({ items: [] }));
      const context = {
        session: { user: { id: "admin1" } },
        services: { adminBooking: { listBookings } },
      };
      const input = { status: "confirmed" };

      const result = await adminBookingHandlers.listBookings({
        context,
        input,
      });

      expect(listBookings).toHaveBeenCalledWith(input);
      expect(result).toEqual({ items: [] });
    });
  });

  describe("getBookingStateHistory", () => {
    test("calls adminBooking.getBookingStateHistory with input.bookingId", async () => {
      const getBookingStateHistory = mock(async () => ({ states: [] }));
      const context = {
        session: { user: { id: "admin1" } },
        services: { adminBooking: { getBookingStateHistory } },
      };
      const input = { bookingId: "b1" };

      const result = await adminBookingHandlers.getBookingStateHistory({
        context,
        input,
      });

      expect(getBookingStateHistory).toHaveBeenCalledWith("b1");
      expect(result).toEqual({ states: [] });
    });
  });

  describe("adminRefund", () => {
    test("calls adminBooking.adminRefund with session user id and input", async () => {
      const adminRefund = mock(async () => ({ ok: true }));
      const context = {
        session: { user: { id: "admin1" } },
        services: { adminBooking: { adminRefund } },
      };
      const input = { bookingId: "b1", amount: 5000 };

      const result = await adminBookingHandlers.adminRefund({ context, input });

      expect(adminRefund).toHaveBeenCalledWith("admin1", input);
      expect(result).toEqual({ ok: true });
    });
  });
});
