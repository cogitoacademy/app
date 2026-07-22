import { describe, test, expect, mock } from "bun:test";
import { ORPCError } from "@orpc/server";
import { createAdminBookingHandler } from "../../modules/admin-booking/admin-booking.handler";
import {
  BookingNotFoundError,
  TerminalStateOverrideError,
  InvalidRefundStateError,
} from "../../modules/admin-booking/admin-booking.errors";

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

    test("maps BookingNotFoundError to NOT_FOUND", async () => {
      const applyOverride = mock(async () => {
        throw new BookingNotFoundError("b1");
      });
      const adminBookingService = { applyOverride } as any;
      const handler = createAdminBookingHandler(adminBookingService);
      const context = { session: { user: { id: "admin1" } } } as any;
      const input = {
        bookingId: "b1",
        reason: "test",
        category: "tutor_no_show",
      };

      try {
        await handler.applyOverride({ context, input });
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e).toBeInstanceOf(ORPCError);
        expect(e.status).toBe(404);
      }
    });

    test("maps TerminalStateOverrideError to CONFLICT", async () => {
      const applyOverride = mock(async () => {
        throw new TerminalStateOverrideError("b1", "completed");
      });
      const adminBookingService = { applyOverride } as any;
      const handler = createAdminBookingHandler(adminBookingService);
      const context = { session: { user: { id: "admin1" } } } as any;
      const input = {
        bookingId: "b1",
        reason: "test",
        category: "tutor_no_show",
      };

      try {
        await handler.applyOverride({ context, input });
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e).toBeInstanceOf(ORPCError);
        expect(e.status).toBe(409);
      }
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

    test("maps InvalidRefundStateError to BAD_REQUEST", async () => {
      const adminRefund = mock(async () => {
        throw new InvalidRefundStateError("pay1", "PENDING");
      });
      const adminBookingService = { adminRefund } as any;
      const handler = createAdminBookingHandler(adminBookingService);
      const context = { session: { user: { id: "admin1" } } } as any;
      const input = { paymentId: "pay1", reason: "test" };

      try {
        await handler.adminRefund({ context, input });
        expect(true).toBe(false);
      } catch (e: any) {
        expect(e).toBeInstanceOf(ORPCError);
        expect(e.status).toBe(400);
      }
    });
  });
});
