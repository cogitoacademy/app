import { adminProcedure } from "../../procedures";
import {
  applyOverrideInput,
  listOverridesInput,
  getBookingStateHistoryInput,
  adminRefundInput,
} from "./admin-booking.types";

export const adminBookingRouter = {
  applyOverride: adminProcedure
    .route({
      method: "POST",
      path: "/admin/booking/override",
      tags: ["Admin Booking"],
      summary: "Apply admin override to a booking",
      description:
        "Override a booking state with an admin action, optionally adjusting held Marks",
    })
    .input(applyOverrideInput)
    .handler(async ({ context, input }) => {
      return context.services.adminBooking.applyOverride(
        context.session.user.id,
        input,
      );
    }),

  listBookings: adminProcedure
    .route({
      method: "POST",
      path: "/admin/booking/list",
      tags: ["Admin Booking"],
      summary: "List bookings for admin review",
      description: "Returns paginated booking list sorted by urgency",
    })
    .input(listOverridesInput)
    .handler(async ({ context, input }) => {
      return context.services.adminBooking.listBookings(input);
    }),

  getBookingStateHistory: adminProcedure
    .route({
      method: "POST",
      path: "/admin/booking/state-history",
      tags: ["Admin Booking"],
      summary: "Get booking state history",
      description: "Returns full state transition history for a booking",
    })
    .input(getBookingStateHistoryInput)
    .handler(async ({ context, input }) => {
      return context.services.adminBooking.getBookingStateHistory(
        input.bookingId,
      );
    }),

  adminRefund: adminProcedure
    .route({
      method: "POST",
      path: "/admin/booking/refund",
      tags: ["Admin Booking"],
      summary: "Issue admin refund for a payment",
      description: "Creates a compensating ledger entry for a payment error",
    })
    .input(adminRefundInput)
    .handler(async ({ context, input }) => {
      return context.services.adminBooking.adminRefund(
        context.session.user.id,
        input,
      );
    }),
};
