import { describe, test, expect, mock } from "bun:test";
import { createAdminBookingHandler } from "../../modules/admin-booking/admin-booking.handler";

describe("adminBookingHandlers", () => {
  describe("applyOverride", () => {
    test("calls adminBooking.applyOverride with session user id and input", async () => {
      const applyOverride = mock(async () => ({
        id: "b1",
        currentState: "cancelled",
      }));
      const adminBookingService = { applyOverride } as any;
      const handler = createAdminBookingHandler(adminBookingService);
      const context = { session: { user: { id: "admin1" } } } as any;
      const input = {
        bookingId: "b1",
        reason: "admin override",
        category: "tutor_no_show",
      };

      const result = await handler.applyOverride({ context, input });

      expect(applyOverride).toHaveBeenCalledWith(
        "admin1",
        expect.objectContaining({ bookingId: "b1", reason: "admin override" }),
      );
      expect(result).toEqual({ id: "b1", currentState: "cancelled" });
    });
  });

  describe("listBookings", () => {
    test("calls adminBooking.listBookings with input", async () => {
      const listBookings = mock(async () => ({ items: [] }));
      const adminBookingService = { listBookings } as any;
      const handler = createAdminBookingHandler(adminBookingService);
      const context = { session: { user: { id: "admin1" } } } as any;
      const input = { status: "confirmed" };

      const result = await handler.listBookings({ context, input });

      expect(listBookings).toHaveBeenCalledWith(input);
      expect(result).toEqual({ items: [] });
    });
  });

  describe("getBookingStateHistory", () => {
    test("calls adminBooking.getBookingStateHistory with input.bookingId", async () => {
      const getBookingStateHistory = mock(async () => ({ states: [] }));
      const adminBookingService = { getBookingStateHistory } as any;
      const handler = createAdminBookingHandler(adminBookingService);
      const context = { session: { user: { id: "admin1" } } } as any;
      const input = { bookingId: "b1" };

      const result = await handler.getBookingStateHistory({ context, input });

      expect(getBookingStateHistory).toHaveBeenCalledWith("b1");
      expect(result).toEqual({ states: [] });
    });
  });

  describe("adminRefund", () => {
    test("calls adminBooking.adminRefund with session user id and input", async () => {
      const adminRefund = mock(async () => ({
        paymentId: "p1",
        status: "refunded",
      }));
      const adminBookingService = { adminRefund } as any;
      const handler = createAdminBookingHandler(adminBookingService);
      const context = { session: { user: { id: "admin1" } } } as any;
      const input = { bookingId: "b1", amount: 5000 };

      const result = await handler.adminRefund({ context, input });

      expect(adminRefund).toHaveBeenCalledWith("admin1", input);
      expect(result).toEqual({ paymentId: "p1", status: "refunded" });
    });
  });
});
