import { z } from "zod";

import { protectedProcedure } from "../../procedures";
import {
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

export const bookingRouter = {
  createSolo: protectedProcedure
    .route({
      method: "POST",
      path: "/booking/solo/create",
      tags: ["Bookings"],
      summary: "Create a solo booking",
      description: "Creates a solo booking request and holds Marks",
    })
    .input(createSoloInput)
    .handler(async ({ context, input }) => {
      return context.services.booking.createSolo(context.session.user.id, {
        tutorId: input.tutorId,
        availabilitySlotId: input.availabilitySlotId,
        modality: input.modality,
        scheduledStartAt: new Date(input.scheduledStartAt),
        scheduledEndAt: new Date(input.scheduledEndAt),
        timezone: input.timezone,
      });
    }),

  get: protectedProcedure
    .route({
      method: "POST",
      path: "/booking/get",
      tags: ["Bookings"],
      summary: "Get booking details",
      description: "Returns a booking with participants and history",
    })
    .input(getBookingInput)
    .handler(async ({ context, input }) => {
      return context.services.booking.getById(input.bookingId);
    }),

  listMine: protectedProcedure
    .route({
      method: "POST",
      path: "/booking/list-mine",
      tags: ["Bookings"],
      summary: "List my bookings",
      description: "Returns bookings where the user is proposer",
    })
    .input(listMineInput)
    .handler(async ({ context, input }) => {
      return context.services.booking.listMine(context.session.user.id, input);
    }),

  cancel: protectedProcedure
    .route({
      method: "POST",
      path: "/booking/cancel",
      tags: ["Bookings"],
      summary: "Cancel booking",
      description: "Cancels a booking, releases held Marks if applicable",
    })
    .input(
      bookingActionInput.extend({
        cancellationReason: z.string().optional(),
      }),
    )
    .handler(async ({ context, input }) => {
      return context.services.booking.cancel(
        context.session.user.id,
        input.bookingId,
        input.cancellationReason,
      );
    }),

  proposeReschedule: protectedProcedure
    .route({
      method: "POST",
      path: "/booking/reschedule/propose",
      tags: ["Bookings"],
      summary: "Propose reschedule",
      description: "Student proposes a new slot for an existing booking",
    })
    .input(proposeRescheduleInput)
    .handler(async ({ context, input }) => {
      return context.services.booking.proposeReschedule(
        context.session.user.id,
        input.bookingId,
        new Date(input.proposedStartAt),
        new Date(input.proposedEndAt),
        input.reason,
      );
    }),

  createGroup: protectedProcedure
    .route({
      method: "POST",
      path: "/booking/group/create",
      tags: ["Bookings"],
      summary: "Create a group booking",
      description:
        "Creates a group booking, holds proposer Marks, invites participants",
    })
    .input(createGroupInput)
    .handler(async ({ context, input }) => {
      return context.services.booking.createGroup(context.session.user.id, {
        tutorId: input.tutorId,
        availabilitySlotId: input.availabilitySlotId,
        modality: input.modality,
        targetGroupSize: input.targetGroupSize,
        inviteeUserIds: input.inviteeUserIds,
        scheduledStartAt: new Date(input.scheduledStartAt),
        scheduledEndAt: new Date(input.scheduledEndAt),
        timezone: input.timezone,
      });
    }),

  createSeries: protectedProcedure
    .route({
      method: "POST",
      path: "/booking/series/create",
      tags: ["Bookings"],
      summary: "Create a series booking",
      description: "Creates a multi-session series booking (2-4 sessions)",
    })
    .input(createSeriesInput)
    .handler(async ({ context, input }) => {
      return context.services.booking.createSeries(context.session.user.id, {
        tutorId: input.tutorId,
        availabilitySlotId: input.availabilitySlotId,
        modality: input.modality,
        sessions: input.sessions.map((s) => ({
          scheduledStartAt: new Date(s.scheduledStartAt),
          scheduledEndAt: new Date(s.scheduledEndAt),
        })),
        timezone: input.timezone,
      });
    }),

  confirmInvite: protectedProcedure
    .route({
      method: "POST",
      path: "/booking/invite/confirm",
      tags: ["Bookings"],
      summary: "Confirm group invite",
      description: "Invitee confirms participation and holds Marks",
    })
    .input(confirmInviteInput)
    .handler(async ({ context, input }) => {
      return context.services.booking.confirmInvite(
        context.session.user.id,
        input.bookingId,
      );
    }),

  declineInvite: protectedProcedure
    .route({
      method: "POST",
      path: "/booking/invite/decline",
      tags: ["Bookings"],
      summary: "Decline group invite",
      description: "Invitee declines participation",
    })
    .input(declineInviteInput)
    .handler(async ({ context, input }) => {
      return context.services.booking.declineInvite(
        context.session.user.id,
        input.bookingId,
        input.reason,
      );
    }),

  reconfirm: protectedProcedure
    .route({
      method: "POST",
      path: "/booking/reconfirm",
      tags: ["Bookings"],
      summary: "Reconfirm after repricing",
      description: "Participant accepts or rejects new price after repricing",
    })
    .input(reconfirmInput)
    .handler(async ({ context, input }) => {
      return context.services.booking.reconfirm(
        context.session.user.id,
        input.bookingId,
        input.accept,
      );
    }),

  withdraw: protectedProcedure
    .route({
      method: "POST",
      path: "/booking/withdraw",
      tags: ["Bookings"],
      summary: "Withdraw from booking",
      description:
        "Participant withdraws; pre-H2 releases held Marks, post-H2 late-cancel",
    })
    .input(withdrawInput)
    .handler(async ({ context, input }) => {
      return context.services.booking.withdraw(
        context.session.user.id,
        input.bookingId,
        input.reason,
      );
    }),

  listSessions: protectedProcedure
    .route({
      method: "POST",
      path: "/booking/sessions/list",
      tags: ["Bookings"],
      summary: "List series sessions",
      description: "Returns child sessions for a series booking",
    })
    .input(listSessionsInput)
    .handler(async ({ context, input }) => {
      return context.services.booking.listSessions(input.bookingId);
    }),
};

export const tutorActionsRouter = {
  acceptBooking: protectedProcedure
    .route({
      method: "POST",
      path: "/tutor/booking/accept",
      tags: ["Tutor", "Bookings"],
      summary: "Accept booking",
      description: "Tutor accepts a solo booking; online goes scheduled",
    })
    .input(bookingActionInput)
    .handler(async ({ context, input }) => {
      return context.services.booking.tutorAccept(
        input.bookingId,
        context.session.user.id,
      );
    }),

  declineBooking: protectedProcedure
    .route({
      method: "POST",
      path: "/tutor/booking/decline",
      tags: ["Tutor", "Bookings"],
      summary: "Decline booking",
      description: "Tutor declines a booking and releases held Marks",
    })
    .input(
      bookingActionInput.extend({
        reason: z.string().optional(),
      }),
    )
    .handler(async ({ context, input }) => {
      return context.services.booking.tutorDecline(
        input.bookingId,
        context.session.user.id,
        input.reason,
      );
    }),

  completeSession: protectedProcedure
    .route({
      method: "POST",
      path: "/tutor/booking/complete",
      tags: ["Tutor", "Bookings"],
      summary: "Complete session",
      description: "Tutor marks a scheduled session as completed",
    })
    .input(completeSessionInput)
    .handler(async ({ context, input }) => {
      return context.services.booking.completeSession(
        input.bookingId,
        context.session.user.id,
        input.sessionNote,
      );
    }),
};
