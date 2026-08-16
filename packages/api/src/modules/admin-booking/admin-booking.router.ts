import { adminProcedure } from "../../procedures";
import {
  applyOverrideInput,
  listOverridesInput,
  getBookingStateHistoryInput,
  adminRefundInput,
  setMeetingLinkInput,
} from "./admin-booking.types";
import type { AdminBookingHandler } from "./admin-booking.handler";

export function createAdminBookingRouter(handler: AdminBookingHandler) {
  return {
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
      .handler(handler.applyOverride),

    previewOverride: adminProcedure
      .route({
        method: "POST",
        path: "/admin/booking/override/preview",
        tags: ["Admin Booking"],
        summary: "Preview an admin override before applying",
        description:
          "Returns the projected booking state and wallet impact without persisting anything",
      })
      .input(applyOverrideInput)
      .handler(handler.previewOverride),

    listBookings: adminProcedure
      .route({
        method: "POST",
        path: "/admin/booking/list",
        tags: ["Admin Booking"],
        summary: "List bookings for admin review",
        description: "Returns paginated booking list sorted by urgency",
      })
      .input(listOverridesInput)
      .handler(handler.listBookings),

    getBookingStateHistory: adminProcedure
      .route({
        method: "POST",
        path: "/admin/booking/state-history",
        tags: ["Admin Booking"],
        summary: "Get booking state history",
        description: "Returns full state transition history for a booking",
      })
      .input(getBookingStateHistoryInput)
      .handler(handler.getBookingStateHistory),

    adminRefund: adminProcedure
      .route({
        method: "POST",
        path: "/admin/booking/refund",
        tags: ["Admin Booking"],
        summary: "Issue admin refund for a payment",
        description: "Creates a compensating ledger entry for a payment error",
      })
      .input(adminRefundInput)
      .handler(handler.adminRefund),

    setMeetingLink: adminProcedure
      .route({
        method: "POST",
        path: "/admin/booking/setMeetingLink",
        tags: ["Admin Booking"],
        summary: "Record a manual meeting URL on a booking",
        description:
          "Admin pastes a valid meeting URL as fallback when Google Meet generation failed or is disabled (U1/FR-21)",
      })
      .input(setMeetingLinkInput)
      .handler(handler.setMeetingLink),
  };
}
