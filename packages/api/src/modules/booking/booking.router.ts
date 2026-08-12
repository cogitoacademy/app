import { z } from "zod";

import { protectedProcedure, tutorProcedure } from "../../procedures";
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
  markAttendanceInput,
} from "./booking.types";
import type { BookingHandler, TutorActionsHandler } from "./booking.handler";

export function createBookingRouter(handler: BookingHandler) {
  return {
    createSolo: protectedProcedure
      .route({
        method: "POST",
        path: "/booking/solo/create",
        tags: ["Bookings"],
        summary: "Create a solo booking",
        description: "Creates a solo booking request and holds Marks",
      })
      .input(createSoloInput)
      .handler(handler.createSolo),

    get: protectedProcedure
      .route({
        method: "POST",
        path: "/booking/get",
        tags: ["Bookings"],
        summary: "Get booking details",
        description: "Returns a booking with participants and history",
      })
      .input(getBookingInput)
      .handler(handler.get),

    listMine: protectedProcedure
      .route({
        method: "POST",
        path: "/booking/list-mine",
        tags: ["Bookings"],
        summary: "List my bookings",
        description: "Returns bookings where the user is proposer",
      })
      .input(listMineInput)
      .handler(handler.listMine),

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
      .handler(handler.cancel),

    proposeReschedule: protectedProcedure
      .route({
        method: "POST",
        path: "/booking/reschedule/propose",
        tags: ["Bookings"],
        summary: "Propose reschedule",
        description: "Student proposes a new slot for an existing booking",
      })
      .input(proposeRescheduleInput)
      .handler(handler.proposeReschedule),

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
      .handler(handler.createGroup),

    createSeries: protectedProcedure
      .route({
        method: "POST",
        path: "/booking/series/create",
        tags: ["Bookings"],
        summary: "Create a series booking",
        description: "Creates a multi-session series booking (2-4 sessions)",
      })
      .input(createSeriesInput)
      .handler(handler.createSeries),

    confirmInvite: protectedProcedure
      .route({
        method: "POST",
        path: "/booking/invite/confirm",
        tags: ["Bookings"],
        summary: "Confirm group invite",
        description: "Invitee confirms participation and holds Marks",
      })
      .input(confirmInviteInput)
      .handler(handler.confirmInvite),

    declineInvite: protectedProcedure
      .route({
        method: "POST",
        path: "/booking/invite/decline",
        tags: ["Bookings"],
        summary: "Decline group invite",
        description: "Invitee declines participation",
      })
      .input(declineInviteInput)
      .handler(handler.declineInvite),

    reconfirm: protectedProcedure
      .route({
        method: "POST",
        path: "/booking/reconfirm",
        tags: ["Bookings"],
        summary: "Reconfirm after repricing",
        description: "Participant accepts or rejects new price after repricing",
      })
      .input(reconfirmInput)
      .handler(handler.reconfirm),

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
      .handler(handler.withdraw),

    listSessions: protectedProcedure
      .route({
        method: "POST",
        path: "/booking/sessions/list",
        tags: ["Bookings"],
        summary: "List series sessions",
        description: "Returns child sessions for a series booking",
      })
      .input(listSessionsInput)
      .handler(handler.listSessions),
  };
}

export function createTutorActionsRouter(handler: TutorActionsHandler) {
  return {
    acceptBooking: tutorProcedure
      .route({
        method: "POST",
        path: "/tutor/booking/accept",
        tags: ["Tutor", "Bookings"],
        summary: "Accept booking",
        description: "Tutor accepts a solo booking; online goes scheduled",
      })
      .input(bookingActionInput)
      .handler(handler.acceptBooking),

    declineBooking: tutorProcedure
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
      .handler(handler.declineBooking),

    completeSession: tutorProcedure
      .route({
        method: "POST",
        path: "/tutor/booking/complete",
        tags: ["Tutor", "Bookings"],
        summary: "Complete session",
        description: "Tutor marks a scheduled session as completed",
      })
      .input(completeSessionInput)
      .handler(handler.completeSession),

    markAttendance: tutorProcedure
      .route({
        method: "POST",
        path: "/tutor/booking/mark-attendance",
        tags: ["Tutor", "Bookings"],
        summary: "Mark tutor attendance",
        description:
          "Tutor marks themselves present or late for a scheduled booking. Marks attendance so the lateness auto-cancel job skips the booking.",
      })
      .input(markAttendanceInput)
      .handler(handler.markAttendance),
  };
}
