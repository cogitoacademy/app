import type { Context } from "../../context";
import { z } from "zod";
import { withDomainMap } from "../../lib/handler-utils";
import { mapBookingError } from "./booking.errors";
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
      return withDomainMap(
        () =>
          booking.createSolo(context.session!.user.id, {
            tutorId: input.tutorId,
            availabilitySlotId: input.availabilitySlotId,
            modality: input.modality,
            scheduledStartAt: input.scheduledStartAt,
            scheduledEndAt: input.scheduledEndAt,
            timezone: input.timezone,
          }),
        mapBookingError,
      );
    },

    get: async ({
      context: _context,
      input,
    }: {
      context: Context;
      input: GetBookingInput;
    }) => {
      return withDomainMap(
        () => booking.getById(input.bookingId),
        mapBookingError,
      );
    },

    listMine: async ({
      context,
      input,
    }: {
      context: Context;
      input: ListMineInput;
    }) => {
      return withDomainMap(
        () => booking.listMine(context.session!.user.id, input),
        mapBookingError,
      );
    },

    cancel: async ({
      context,
      input,
    }: {
      context: Context;
      input: BookingActionInput & { cancellationReason?: string };
    }) => {
      return withDomainMap(
        () =>
          booking.cancel(
            context.session!.user.id,
            input.bookingId,
            input.cancellationReason,
          ),
        mapBookingError,
      );
    },

    proposeReschedule: async ({
      context,
      input,
    }: {
      context: Context;
      input: ProposeRescheduleInput;
    }) => {
      return withDomainMap(
        () =>
          booking.proposeReschedule(
            context.session!.user.id,
            input.bookingId,
            input.proposedStartAt,
            input.proposedEndAt,
            input.reason,
          ),
        mapBookingError,
      );
    },

    createGroup: async ({
      context,
      input,
    }: {
      context: Context;
      input: CreateGroupInput;
    }) => {
      return withDomainMap(
        () =>
          booking.createGroup(context.session!.user.id, {
            tutorId: input.tutorId,
            availabilitySlotId: input.availabilitySlotId,
            modality: input.modality,
            targetGroupSize: input.targetGroupSize,
            inviteeUserIds: input.inviteeUserIds,
            scheduledStartAt: input.scheduledStartAt,
            scheduledEndAt: input.scheduledEndAt,
            timezone: input.timezone,
          }),
        mapBookingError,
      );
    },

    createSeries: async ({
      context,
      input,
    }: {
      context: Context;
      input: CreateSeriesInput;
    }) => {
      return withDomainMap(
        () =>
          booking.createSeries(context.session!.user.id, {
            tutorId: input.tutorId,
            availabilitySlotId: input.availabilitySlotId,
            modality: input.modality,
            sessions: input.sessions,
            timezone: input.timezone,
          }),
        mapBookingError,
      );
    },

    confirmInvite: async ({
      context,
      input,
    }: {
      context: Context;
      input: ConfirmInviteInput;
    }) => {
      return withDomainMap(
        () => booking.confirmInvite(context.session!.user.id, input.bookingId),
        mapBookingError,
      );
    },

    declineInvite: async ({
      context,
      input,
    }: {
      context: Context;
      input: DeclineInviteInput;
    }) => {
      return withDomainMap(
        () =>
          booking.declineInvite(
            context.session!.user.id,
            input.bookingId,
            input.reason,
          ),
        mapBookingError,
      );
    },

    reconfirm: async ({
      context,
      input,
    }: {
      context: Context;
      input: ReconfirmInput;
    }) => {
      return withDomainMap(
        () =>
          booking.reconfirm(
            context.session!.user.id,
            input.bookingId,
            input.accept,
          ),
        mapBookingError,
      );
    },

    withdraw: async ({
      context,
      input,
    }: {
      context: Context;
      input: WithdrawInput;
    }) => {
      return withDomainMap(
        () =>
          booking.withdraw(
            context.session!.user.id,
            input.bookingId,
            input.reason,
          ),
        mapBookingError,
      );
    },

    listSessions: async ({
      context: _context,
      input,
    }: {
      context: Context;
      input: ListSessionsInput;
    }) => {
      return withDomainMap(
        () => booking.listSessions(input.bookingId),
        mapBookingError,
      );
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
      return withDomainMap(
        () => booking.tutorAccept(input.bookingId, context.session!.user.id),
        mapBookingError,
      );
    },

    declineBooking: async ({
      context,
      input,
    }: {
      context: Context;
      input: BookingActionInput & { reason?: string };
    }) => {
      return withDomainMap(
        () =>
          booking.tutorDecline(
            input.bookingId,
            context.session!.user.id,
            input.reason,
          ),
        mapBookingError,
      );
    },

    completeSession: async ({
      context,
      input,
    }: {
      context: Context;
      input: CompleteSessionInput;
    }) => {
      return withDomainMap(
        () =>
          booking.completeSession(
            input.bookingId,
            context.session!.user.id,
            input.sessionNote,
          ),
        mapBookingError,
      );
    },
  };
}
