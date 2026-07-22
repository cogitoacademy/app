import type { Context } from "../../context";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { internalServerError } from "../../lib/errors";
import type { AdminBookingService } from "./admin-booking.service";
import {
  applyOverrideInput,
  listOverridesInput,
  getBookingStateHistoryInput,
  adminRefundInput,
} from "./admin-booking.types";

type ApplyOverrideInput = z.infer<typeof applyOverrideInput>;
type ListOverridesInput = z.infer<typeof listOverridesInput>;
type GetBookingStateHistoryInput = z.infer<typeof getBookingStateHistoryInput>;
type AdminRefundInput = z.infer<typeof adminRefundInput>;

export type AdminBookingHandler = ReturnType<typeof createAdminBookingHandler>;

export function createAdminBookingHandler(
  adminBookingService: AdminBookingService,
) {
  return {
    applyOverride: async ({
      context,
      input,
    }: {
      context: Context;
      input: ApplyOverrideInput;
    }) => {
      try {
        return adminBookingService.applyOverride(context.session!.user.id, {
          bookingId: input.bookingId,
          category: input.category,
          reason: input.reason,
          affectedParticipants: input.affectedParticipants,
          marksAction: input.marksAction,
          userNote: input.userNote,
          internalNote: input.internalNote,
        });
      } catch (err) {
        if (err instanceof ORPCError) throw err;
        throw internalServerError("Failed to apply override", err);
      }
    },

    listBookings: async ({
      context: _context,
      input,
    }: {
      context: Context;
      input: ListOverridesInput;
    }) => {
      try {
        return adminBookingService.listBookings(input);
      } catch (err) {
        if (err instanceof ORPCError) throw err;
        throw internalServerError("Failed to list bookings", err);
      }
    },

    getBookingStateHistory: async ({
      context: _context,
      input,
    }: {
      context: Context;
      input: GetBookingStateHistoryInput;
    }) => {
      try {
        return adminBookingService.getBookingStateHistory(input.bookingId);
      } catch (err) {
        if (err instanceof ORPCError) throw err;
        throw internalServerError("Failed to fetch booking state history", err);
      }
    },

    adminRefund: async ({
      context,
      input,
    }: {
      context: Context;
      input: AdminRefundInput;
    }) => {
      try {
        return adminBookingService.adminRefund(context.session!.user.id, input);
      } catch (err) {
        if (err instanceof ORPCError) throw err;
        throw internalServerError("Failed to process admin refund", err);
      }
    },
  };
}
