import { z } from "zod";

import { protectedProcedure } from "../../procedures";
import {
  createSoloInput,
  getBookingInput,
  listMineInput,
  bookingActionInput,
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
