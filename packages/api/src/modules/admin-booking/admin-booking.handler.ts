import type { Context } from "../../context";
import { z } from "zod";
import { withDomainMap } from "../../lib/handler-utils";
import type { AdminBookingService } from "./admin-booking.service";
import { mapAdminBookingError } from "./admin-booking.errors";
import {
  applyOverrideInput,
  listOverridesInput,
  getBookingStateHistoryInput,
  adminRefundInput,
  setMeetingLinkInput,
} from "./admin-booking.types";

type ApplyOverrideInput = z.infer<typeof applyOverrideInput>;
type ListOverridesInput = z.infer<typeof listOverridesInput>;
type GetBookingStateHistoryInput = z.infer<typeof getBookingStateHistoryInput>;
type AdminRefundInput = z.infer<typeof adminRefundInput>;
type SetMeetingLinkInput = z.infer<typeof setMeetingLinkInput>;

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
      return withDomainMap(
        () =>
          adminBookingService.applyOverride(context.session!.user.id, {
            bookingId: input.bookingId,
            category: input.category,
            reason: input.reason,
            affectedParticipants: input.affectedParticipants,
            marksAction: input.marksAction,
            userNote: input.userNote,
            internalNote: input.internalNote,
          }),
        mapAdminBookingError,
      );
    },

    previewOverride: async ({
      context: _context,
      input,
    }: {
      context: Context;
      input: ApplyOverrideInput;
    }) => {
      return withDomainMap(
        () =>
          adminBookingService.previewOverride({
            bookingId: input.bookingId,
            category: input.category,
            reason: input.reason,
            affectedParticipants: input.affectedParticipants,
            marksAction: input.marksAction,
            userNote: input.userNote,
            internalNote: input.internalNote,
          }),
        mapAdminBookingError,
      );
    },

    listBookings: async ({
      context: _context,
      input,
    }: {
      context: Context;
      input: ListOverridesInput;
    }) => {
      return withDomainMap(
        () => adminBookingService.listBookings(input),
        mapAdminBookingError,
      );
    },

    getBookingStateHistory: async ({
      context: _context,
      input,
    }: {
      context: Context;
      input: GetBookingStateHistoryInput;
    }) => {
      return withDomainMap(
        () => adminBookingService.getBookingStateHistory(input.bookingId),
        mapAdminBookingError,
      );
    },

    adminRefund: async ({
      context,
      input,
    }: {
      context: Context;
      input: AdminRefundInput;
    }) => {
      return withDomainMap(
        () => adminBookingService.adminRefund(context.session!.user.id, input),
        mapAdminBookingError,
      );
    },

    setMeetingLink: async ({
      context,
      input,
    }: {
      context: Context;
      input: SetMeetingLinkInput;
    }) => {
      return withDomainMap(
        () =>
          adminBookingService.setMeetingLink(context.session!.user.id, input),
        mapAdminBookingError,
      );
    },
  };
}
