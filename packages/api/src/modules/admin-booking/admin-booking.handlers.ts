import type { Context } from "../../context";

export const adminBookingHandlers = {
  applyOverride: async ({
    context,
    input,
  }: {
    context: Context;
    input: any;
  }) => {
    return context.services.adminBooking.applyOverride(
      context.session!.user.id,
      input,
    );
  },

  listBookings: async ({
    context,
    input,
  }: {
    context: Context;
    input: any;
  }) => {
    return context.services.adminBooking.listBookings(input);
  },

  getBookingStateHistory: async ({
    context,
    input,
  }: {
    context: Context;
    input: any;
  }) => {
    return context.services.adminBooking.getBookingStateHistory(
      input.bookingId,
    );
  },

  adminRefund: async ({ context, input }: { context: Context; input: any }) => {
    return context.services.adminBooking.adminRefund(
      context.session!.user.id,
      input,
    );
  },
};
