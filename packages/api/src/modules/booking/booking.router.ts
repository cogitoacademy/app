import {
  protectedProcedure,
  studentProcedure,
  tutorProcedure,
} from "../../procedures";
import {
  createSoloInput,
  createGroupInput,
  createSeriesInput,
  createGroupSeriesInput,
  getBookingInput,
  listMineInput,
  listSessionsInput,
  bookingActionInput,
  cancelBookingInput,
  declineBookingInput,
  confirmInviteInput,
  declineInviteInput,
  reconfirmInput,
  withdrawInput,
  proposeRescheduleInput,
  completeSessionInput,
  markAttendanceInput,
  cancelSessionInput,
  acceptRescheduleInput,
  rejectRescheduleInput,
  addSessionNoteInput,
  getSessionNotesInput,
} from "./booking.types";
import type { BookingHandler, TutorActionsHandler } from "./booking.handler";

export function createBookingRouter(handler: BookingHandler) {
  return {
    createSolo: studentProcedure
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

    getRescheduleAvailability: protectedProcedure
      .route({
        method: "POST",
        path: "/booking/reschedule/availability",
        tags: ["Bookings"],
        summary: "List tutor availability for rescheduling",
        description:
          "Returns active tutor availability to booking participants",
      })
      .input(getBookingInput)
      .handler(handler.getRescheduleAvailability),

    listMine: studentProcedure
      .route({
        method: "POST",
        path: "/booking/list-mine",
        tags: ["Bookings"],
        summary: "List my bookings",
        description: "Returns bookings where the user is proposer",
      })
      .input(listMineInput)
      .handler(handler.listMine),

    cancel: studentProcedure
      .route({
        method: "POST",
        path: "/booking/cancel",
        tags: ["Bookings"],
        summary: "Cancel booking",
        description: "Cancels a booking, releases held Marks if applicable",
      })
      .input(cancelBookingInput)
      .handler(handler.cancel),

    acceptReschedule: protectedProcedure
      .route({
        method: "POST",
        path: "/booking/reschedule/accept",
        tags: ["Bookings"],
        summary: "Accept reschedule",
        description: "A required tutor or student accepts the active proposal",
      })
      .input(acceptRescheduleInput)
      .handler(handler.acceptReschedule),

    rejectReschedule: protectedProcedure
      .route({
        method: "POST",
        path: "/booking/reschedule/reject",
        tags: ["Bookings"],
        summary: "Reject reschedule",
        description: "A required tutor or student rejects the active proposal",
      })
      .input(rejectRescheduleInput)
      .handler(handler.rejectReschedule),

    cancelSession: studentProcedure
      .route({
        method: "POST",
        path: "/booking/session/cancel",
        tags: ["Bookings"],
        summary: "Cancel series session",
        description:
          "Student cancels an individual series session more than 2h before start",
      })
      .input(cancelSessionInput)
      .handler(handler.cancelSession),

    addSessionNote: protectedProcedure
      .route({
        method: "POST",
        path: "/booking/session-note/add",
        tags: ["Bookings"],
        summary: "Add session note",
        description:
          "Tutor or student adds a note to a completed session (sanitized)",
      })
      .input(addSessionNoteInput)
      .handler(handler.addSessionNote),

    getSessionNotes: protectedProcedure
      .route({
        method: "POST",
        path: "/booking/session-note/list",
        tags: ["Bookings"],
        summary: "Get session notes",
        description: "Tutor or student lists notes for a completed session",
      })
      .input(getSessionNotesInput)
      .handler(handler.getSessionNotes),

    createGroup: studentProcedure
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

    createSeries: studentProcedure
      .route({
        method: "POST",
        path: "/booking/series/create",
        tags: ["Bookings"],
        summary: "Create a series booking",
        description: "Creates a multi-session series booking (2-4 sessions)",
      })
      .input(createSeriesInput)
      .handler(handler.createSeries),

    createGroupSeries: studentProcedure
      .route({
        method: "POST",
        path: "/booking/group-series/create",
        tags: ["Bookings"],
        summary: "Create a group series booking",
        description:
          "Creates a multi-session group series (FR-20): the proposer holds the full package up front and invitees accept the whole series",
      })
      .input(createGroupSeriesInput)
      .handler(handler.createGroupSeries),

    confirmInvite: studentProcedure
      .route({
        method: "POST",
        path: "/booking/invite/confirm",
        tags: ["Bookings"],
        summary: "Confirm group invite",
        description: "Invitee confirms participation and holds Marks",
      })
      .input(confirmInviteInput)
      .handler(handler.confirmInvite),

    declineInvite: studentProcedure
      .route({
        method: "POST",
        path: "/booking/invite/decline",
        tags: ["Bookings"],
        summary: "Decline group invite",
        description: "Invitee declines participation",
      })
      .input(declineInviteInput)
      .handler(handler.declineInvite),

    reconfirm: studentProcedure
      .route({
        method: "POST",
        path: "/booking/reconfirm",
        tags: ["Bookings"],
        summary: "Reconfirm after repricing",
        description: "Participant accepts or rejects new price after repricing",
      })
      .input(reconfirmInput)
      .handler(handler.reconfirm),

    withdraw: studentProcedure
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

    proposeReschedule: studentProcedure
      .route({
        method: "POST",
        path: "/booking/reschedule/propose",
        tags: ["Bookings"],
        summary: "Propose a new booking time",
        description:
          "Tutor or booking proposer creates or counters a reschedule proposal",
      })
      .input(proposeRescheduleInput)
      .handler(handler.proposeReschedule),
  };
}

export function createTutorActionsRouter(handler: TutorActionsHandler) {
  return {
    listBookings: tutorProcedure
      .route({
        method: "POST",
        path: "/tutor/booking/list",
        tags: ["Tutor", "Bookings"],
        summary: "List assigned bookings",
        description: "Returns bookings assigned to the signed-in tutor",
      })
      .input(listMineInput)
      .handler(handler.listBookings),

    proposeReschedule: tutorProcedure
      .route({
        method: "POST",
        path: "/tutor/booking/reschedule/propose",
        tags: ["Tutor", "Bookings"],
        summary: "Propose reschedule",
        description: "Tutor proposes a new slot for an existing booking",
      })
      .input(proposeRescheduleInput)
      .handler(handler.proposeReschedule),

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
      .input(declineBookingInput)
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
