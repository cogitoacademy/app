import type { Context } from "../../context";

export const bookingHandlers = {
  createSolo: async ({ context, input }: { context: Context; input: any }) => {
    return context.services.booking.createSolo(context.session!.user.id, {
      tutorId: input.tutorId,
      availabilitySlotId: input.availabilitySlotId,
      modality: input.modality,
      scheduledStartAt: new Date(input.scheduledStartAt),
      scheduledEndAt: new Date(input.scheduledEndAt),
      timezone: input.timezone,
    });
  },

  get: async ({ context, input }: { context: Context; input: any }) => {
    return context.services.booking.getById(input.bookingId);
  },

  listMine: async ({ context, input }: { context: Context; input: any }) => {
    return context.services.booking.listMine(context.session!.user.id, input);
  },

  cancel: async ({ context, input }: { context: Context; input: any }) => {
    return context.services.booking.cancel(
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
    input: any;
  }) => {
    return context.services.booking.proposeReschedule(
      context.session!.user.id,
      input.bookingId,
      new Date(input.proposedStartAt),
      new Date(input.proposedEndAt),
      input.reason,
    );
  },

  createGroup: async ({ context, input }: { context: Context; input: any }) => {
    return context.services.booking.createGroup(context.session!.user.id, {
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
    input: any;
  }) => {
    return context.services.booking.createSeries(context.session!.user.id, {
      tutorId: input.tutorId,
      availabilitySlotId: input.availabilitySlotId,
      modality: input.modality,
      sessions: input.sessions.map((s: any) => ({
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
    input: any;
  }) => {
    return context.services.booking.confirmInvite(
      context.session!.user.id,
      input.bookingId,
    );
  },

  declineInvite: async ({
    context,
    input,
  }: {
    context: Context;
    input: any;
  }) => {
    return context.services.booking.declineInvite(
      context.session!.user.id,
      input.bookingId,
      input.reason,
    );
  },

  reconfirm: async ({ context, input }: { context: Context; input: any }) => {
    return context.services.booking.reconfirm(
      context.session!.user.id,
      input.bookingId,
      input.accept,
    );
  },

  withdraw: async ({ context, input }: { context: Context; input: any }) => {
    return context.services.booking.withdraw(
      context.session!.user.id,
      input.bookingId,
      input.reason,
    );
  },

  listSessions: async ({
    context,
    input,
  }: {
    context: Context;
    input: any;
  }) => {
    return context.services.booking.listSessions(input.bookingId);
  },
};

export const tutorActionsHandlers = {
  acceptBooking: async ({
    context,
    input,
  }: {
    context: Context;
    input: any;
  }) => {
    return context.services.booking.tutorAccept(
      input.bookingId,
      context.session!.user.id,
    );
  },

  declineBooking: async ({
    context,
    input,
  }: {
    context: Context;
    input: any;
  }) => {
    return context.services.booking.tutorDecline(
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
    input: any;
  }) => {
    return context.services.booking.completeSession(
      input.bookingId,
      context.session!.user.id,
      input.sessionNote,
    );
  },
};
