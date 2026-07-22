import type { Context } from "../../context";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { internalServerError } from "../../lib/errors";
import type {
  createSoloInput,
  createGroupInput,
  createSeriesInput,
  getBookingInput,
  listMineInput,
  listSessionsInput,
  bookingActionInput,
  confirmInviteInput,
  declineInviteInput,
  reconfirmInput,
  withdrawInput,
  proposeRescheduleInput,
  completeSessionInput,
} from "./booking.types";
import type { BookingService } from "./booking.service";

type CreateSoloInput = z.infer<typeof createSoloInput>;
type CreateGroupInput = z.infer<typeof createGroupInput>;
type CreateSeriesInput = z.infer<typeof createSeriesInput>;
type GetBookingInput = z.infer<typeof getBookingInput>;
type ListMineInput = z.infer<typeof listMineInput>;
type ListSessionsInput = z.infer<typeof listSessionsInput>;
type BookingActionInput = z.infer<typeof bookingActionInput>;
type ConfirmInviteInput = z.infer<typeof confirmInviteInput>;
type DeclineInviteInput = z.infer<typeof declineInviteInput>;
type ReconfirmInput = z.infer<typeof reconfirmInput>;
type WithdrawInput = z.infer<typeof withdrawInput>;
type ProposeRescheduleInput = z.infer<typeof proposeRescheduleInput>;
type CompleteSessionInput = z.infer<typeof completeSessionInput>;

export type BookingHandler = ReturnType<typeof createBookingHandler>;
export type TutorActionsHandler = ReturnType<typeof createTutorActionsHandler>;

export function createBookingHandler(booking: BookingService) {
  return {
    createSolo: async ({
      context,
      input,
    }: {
      context: Context;
      input: CreateSoloInput;
    }) => {
      try {
        return booking.createSolo(context.session!.user.id, {
          tutorId: input.tutorId,
          availabilitySlotId: input.availabilitySlotId,
          modality: input.modality,
          scheduledStartAt: input.scheduledStartAt,
          scheduledEndAt: input.scheduledEndAt,
          timezone: input.timezone,
        });
      } catch (err) {
        if (err instanceof ORPCError) throw err;
        throw internalServerError("Failed to create solo booking", err);
      }
    },

    get: async ({
      context: _context,
      input,
    }: {
      context: Context;
      input: GetBookingInput;
    }) => {
      try {
        return booking.getById(input.bookingId);
      } catch (err) {
        if (err instanceof ORPCError) throw err;
        throw internalServerError("Failed to fetch booking", err);
      }
    },

    listMine: async ({
      context,
      input,
    }: {
      context: Context;
      input: ListMineInput;
    }) => {
      try {
        return booking.listMine(context.session!.user.id, input);
      } catch (err) {
        if (err instanceof ORPCError) throw err;
        throw internalServerError("Failed to list bookings", err);
      }
    },

    cancel: async ({
      context,
      input,
    }: {
      context: Context;
      input: BookingActionInput & { cancellationReason?: string };
    }) => {
      try {
        return booking.cancel(
          context.session!.user.id,
          input.bookingId,
          input.cancellationReason,
        );
      } catch (err) {
        if (err instanceof ORPCError) throw err;
        throw internalServerError("Failed to cancel booking", err);
      }
    },

    proposeReschedule: async ({
      context,
      input,
    }: {
      context: Context;
      input: ProposeRescheduleInput;
    }) => {
      try {
        return booking.proposeReschedule(
          context.session!.user.id,
          input.bookingId,
          input.proposedStartAt,
          input.proposedEndAt,
          input.reason,
        );
      } catch (err) {
        if (err instanceof ORPCError) throw err;
        throw internalServerError("Failed to propose reschedule", err);
      }
    },

    createGroup: async ({
      context,
      input,
    }: {
      context: Context;
      input: CreateGroupInput;
    }) => {
      try {
        return booking.createGroup(context.session!.user.id, {
          tutorId: input.tutorId,
          availabilitySlotId: input.availabilitySlotId,
          modality: input.modality,
          targetGroupSize: input.targetGroupSize,
          inviteeUserIds: input.inviteeUserIds,
          scheduledStartAt: input.scheduledStartAt,
          scheduledEndAt: input.scheduledEndAt,
          timezone: input.timezone,
        });
      } catch (err) {
        if (err instanceof ORPCError) throw err;
        throw internalServerError("Failed to create group booking", err);
      }
    },

    createSeries: async ({
      context,
      input,
    }: {
      context: Context;
      input: CreateSeriesInput;
    }) => {
      try {
        return booking.createSeries(context.session!.user.id, {
          tutorId: input.tutorId,
          availabilitySlotId: input.availabilitySlotId,
          modality: input.modality,
          sessions: input.sessions,
          timezone: input.timezone,
        });
      } catch (err) {
        if (err instanceof ORPCError) throw err;
        throw internalServerError("Failed to create booking series", err);
      }
    },

    confirmInvite: async ({
      context,
      input,
    }: {
      context: Context;
      input: ConfirmInviteInput;
    }) => {
      try {
        return booking.confirmInvite(context.session!.user.id, input.bookingId);
      } catch (err) {
        if (err instanceof ORPCError) throw err;
        throw internalServerError("Failed to confirm invite", err);
      }
    },

    declineInvite: async ({
      context,
      input,
    }: {
      context: Context;
      input: DeclineInviteInput;
    }) => {
      try {
        return booking.declineInvite(
          context.session!.user.id,
          input.bookingId,
          input.reason,
        );
      } catch (err) {
        if (err instanceof ORPCError) throw err;
        throw internalServerError("Failed to decline invite", err);
      }
    },

    reconfirm: async ({
      context,
      input,
    }: {
      context: Context;
      input: ReconfirmInput;
    }) => {
      try {
        return booking.reconfirm(
          context.session!.user.id,
          input.bookingId,
          input.accept,
        );
      } catch (err) {
        if (err instanceof ORPCError) throw err;
        throw internalServerError("Failed to reconfirm booking", err);
      }
    },

    withdraw: async ({
      context,
      input,
    }: {
      context: Context;
      input: WithdrawInput;
    }) => {
      try {
        return booking.withdraw(
          context.session!.user.id,
          input.bookingId,
          input.reason,
        );
      } catch (err) {
        if (err instanceof ORPCError) throw err;
        throw internalServerError("Failed to withdraw from booking", err);
      }
    },

    listSessions: async ({
      context: _context,
      input,
    }: {
      context: Context;
      input: ListSessionsInput;
    }) => {
      try {
        return booking.listSessions(input.bookingId);
      } catch (err) {
        if (err instanceof ORPCError) throw err;
        throw internalServerError("Failed to list sessions", err);
      }
    },
  };
}

export function createTutorActionsHandler(booking: BookingService) {
  return {
    acceptBooking: async ({
      context,
      input,
    }: {
      context: Context;
      input: BookingActionInput;
    }) => {
      try {
        return booking.tutorAccept(input.bookingId, context.session!.user.id);
      } catch (err) {
        if (err instanceof ORPCError) throw err;
        throw internalServerError("Failed to accept booking", err);
      }
    },

    declineBooking: async ({
      context,
      input,
    }: {
      context: Context;
      input: BookingActionInput & { reason?: string };
    }) => {
      try {
        return booking.tutorDecline(
          input.bookingId,
          context.session!.user.id,
          input.reason,
        );
      } catch (err) {
        if (err instanceof ORPCError) throw err;
        throw internalServerError("Failed to decline booking", err);
      }
    },

    completeSession: async ({
      context,
      input,
    }: {
      context: Context;
      input: CompleteSessionInput;
    }) => {
      try {
        return booking.completeSession(
          input.bookingId,
          context.session!.user.id,
          input.sessionNote,
        );
      } catch (err) {
        if (err instanceof ORPCError) throw err;
        throw internalServerError("Failed to complete session", err);
      }
    },
  };
}
