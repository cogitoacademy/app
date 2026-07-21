import type { Context } from "../../context";
import type { z } from "zod";
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
      return booking.createSolo(context.session!.user.id, {
        tutorId: input.tutorId,
        availabilitySlotId: input.availabilitySlotId,
        modality: input.modality,
        scheduledStartAt: new Date(input.scheduledStartAt),
        scheduledEndAt: new Date(input.scheduledEndAt),
        timezone: input.timezone,
      });
    },

    get: async ({
      context: _context,
      input,
    }: {
      context: Context;
      input: GetBookingInput;
    }) => {
      return booking.getById(input.bookingId);
    },

    listMine: async ({
      context,
      input,
    }: {
      context: Context;
      input: ListMineInput;
    }) => {
      return booking.listMine(context.session!.user.id, input);
    },

    cancel: async ({
      context,
      input,
    }: {
      context: Context;
      input: BookingActionInput & { cancellationReason?: string };
    }) => {
      return booking.cancel(
        context.session!.user.id,
        input.bookingId,
        input.cancellationReason,
      );
    },

    proposeReschedule: async ({
      context,
      input,
    }: {
      context: Context;
      input: ProposeRescheduleInput;
    }) => {
      return booking.proposeReschedule(
        context.session!.user.id,
        input.bookingId,
        new Date(input.proposedStartAt),
        new Date(input.proposedEndAt),
        input.reason,
      );
    },

    createGroup: async ({
      context,
      input,
    }: {
      context: Context;
      input: CreateGroupInput;
    }) => {
      return booking.createGroup(context.session!.user.id, {
        tutorId: input.tutorId,
        availabilitySlotId: input.availabilitySlotId,
        modality: input.modality,
        targetGroupSize: input.targetGroupSize,
        inviteeUserIds: input.inviteeUserIds,
        scheduledStartAt: new Date(input.scheduledStartAt),
        scheduledEndAt: new Date(input.scheduledEndAt),
        timezone: input.timezone,
      });
    },

    createSeries: async ({
      context,
      input,
    }: {
      context: Context;
      input: CreateSeriesInput;
    }) => {
      return booking.createSeries(context.session!.user.id, {
        tutorId: input.tutorId,
        availabilitySlotId: input.availabilitySlotId,
        modality: input.modality,
        sessions: input.sessions.map((s) => ({
          scheduledStartAt: new Date(s.scheduledStartAt),
          scheduledEndAt: new Date(s.scheduledEndAt),
        })),
        timezone: input.timezone,
      });
    },

    confirmInvite: async ({
      context,
      input,
    }: {
      context: Context;
      input: ConfirmInviteInput;
    }) => {
      return booking.confirmInvite(context.session!.user.id, input.bookingId);
    },

    declineInvite: async ({
      context,
      input,
    }: {
      context: Context;
      input: DeclineInviteInput;
    }) => {
      return booking.declineInvite(
        context.session!.user.id,
        input.bookingId,
        input.reason,
      );
    },

    reconfirm: async ({
      context,
      input,
    }: {
      context: Context;
      input: ReconfirmInput;
    }) => {
      return booking.reconfirm(
        context.session!.user.id,
        input.bookingId,
        input.accept,
      );
    },

    withdraw: async ({
      context,
      input,
    }: {
      context: Context;
      input: WithdrawInput;
    }) => {
      return booking.withdraw(
        context.session!.user.id,
        input.bookingId,
        input.reason,
      );
    },

    listSessions: async ({
      context: _context,
      input,
    }: {
      context: Context;
      input: ListSessionsInput;
    }) => {
      return booking.listSessions(input.bookingId);
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
      return booking.tutorAccept(input.bookingId, context.session!.user.id);
    },

    declineBooking: async ({
      context,
      input,
    }: {
      context: Context;
      input: BookingActionInput & { reason?: string };
    }) => {
      return booking.tutorDecline(
        input.bookingId,
        context.session!.user.id,
        input.reason,
      );
    },

    completeSession: async ({
      context,
      input,
    }: {
      context: Context;
      input: CompleteSessionInput;
    }) => {
      return booking.completeSession(
        input.bookingId,
        context.session!.user.id,
        input.sessionNote,
      );
    },
  };
}
