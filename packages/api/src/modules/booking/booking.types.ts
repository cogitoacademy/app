import { z } from "zod";
import { externalHttpUrl } from "../../lib/url-schema";

const futureStart = z.coerce
  .date()
  .refine((date) => date > new Date(), "Must be in the future");

const learningGoal = z.string().trim().max(2000).default("");
const subjectId = z.string().min(1).max(100).optional();

export const createSoloInput = z
  .object({
    tutorId: z.string().max(100),
    availabilitySlotId: z.string().max(100),
    modality: z.enum(["online", "offline"]),
    scheduledStartAt: futureStart,
    scheduledEndAt: z.coerce.date().optional(),
    subjectId,
    learningGoal,
    timezone: z.string().max(50).default("Asia/Jakarta"),
    requestedRoomId: z.string().max(100).optional(),
  })
  .refine((d) => d.modality === "offline" || !d.requestedRoomId, {
    message: "requestedRoomId is only valid for offline bookings",
    path: ["requestedRoomId"],
  });

export const createGroupInput = z
  .object({
    tutorId: z.string().max(100),
    availabilitySlotId: z.string().max(100),
    modality: z.enum(["online", "offline"]),
    targetGroupSize: z.number().int().min(2).max(6),
    inviteeUserIds: z.array(z.string().max(100)).min(1).max(5),
    scheduledStartAt: futureStart,
    scheduledEndAt: z.coerce.date().optional(),
    subjectId,
    learningGoal,
    timezone: z.string().max(50).default("Asia/Jakarta"),
    requestedRoomId: z.string().max(100).optional(),
  })
  .refine((d) => d.modality === "offline" || !d.requestedRoomId, {
    message: "requestedRoomId is only valid for offline bookings",
    path: ["requestedRoomId"],
  });

export const createSeriesInput = z.object({
  tutorId: z.string().max(100),
  availabilitySlotId: z.string().max(100),
  modality: z.enum(["online", "offline"]),
  sessions: z
    .array(
      z.object({
        availabilitySlotId: z.string().max(100).optional(),
        scheduledStartAt: futureStart,
        scheduledEndAt: z.coerce.date().optional(),
      }),
    )
    .min(2)
    .max(4),
  subjectId,
  learningGoal,
  timezone: z.string().max(50).default("Asia/Jakarta"),
});

export const createGroupSeriesInput = z.object({
  tutorId: z.string().max(100),
  availabilitySlotId: z.string().max(100),
  modality: z.enum(["online", "offline"]),
  targetGroupSize: z.number().int().min(2).max(6),
  inviteeUserIds: z.array(z.string().max(100)).min(1).max(5),
  sessions: z
    .array(
      z.object({
        availabilitySlotId: z.string().max(100).optional(),
        scheduledStartAt: futureStart,
        scheduledEndAt: z.coerce.date().optional(),
      }),
    )
    .min(2)
    .max(4),
  subjectId,
  learningGoal,
  timezone: z.string().max(50).default("Asia/Jakarta"),
});

export const bookingActionInput = z.object({
  bookingId: z.string().max(100),
});

export const cancelBookingInput = bookingActionInput.extend({
  cancellationReason: z.string().max(500).optional(),
});

export const declineBookingInput = bookingActionInput.extend({
  reason: z.string().max(500).optional(),
});

export const confirmInviteInput = z.object({
  bookingId: z.string().max(100),
});

export const declineInviteInput = z.object({
  bookingId: z.string().max(100),
  reason: z.string().max(2000).optional(),
});

export const withdrawInviteInput = z.object({
  bookingId: z.string().max(100),
  inviteeUserId: z.string().max(100),
  reason: z.string().max(2000).optional(),
});

export const reconfirmInput = z.object({
  bookingId: z.string().max(100),
  accept: z.boolean(),
});

export const withdrawInput = z.object({
  bookingId: z.string().max(100),
  reason: z.string().max(2000).optional(),
});

export const proposeRescheduleInput = z.object({
  bookingId: z.string().max(100),
  sessionId: z.string().max(100).optional(),
  availabilitySlotId: z.string().max(100).optional(),
  proposedStartAt: futureStart,
  proposedEndAt: z.coerce.date().optional(),
  reason: z.string().max(2000).optional(),
});

export const completeSessionInput = z.object({
  bookingId: z.string().max(100),
  sessionId: z.string().max(100).optional(),
});

export const setMeetingLinkInput = bookingActionInput.extend({
  url: externalHttpUrl,
});

export const cancelSessionInput = z.object({
  sessionId: z.string().max(100),
});

export const acceptRescheduleInput = bookingActionInput.extend({
  proposalId: z.string().max(100).optional(),
});
export const rejectRescheduleInput = bookingActionInput.extend({
  proposalId: z.string().max(100).optional(),
});

export const addSessionNoteInput = z.object({
  bookingId: z.string().max(100),
  content: z.string().max(10000),
});

export const getSessionNotesInput = bookingActionInput;

export const markAttendanceInput = z.object({
  bookingId: z.string().max(100),
  attendance: z.enum(["present", "late"]),
});

export const markParticipantNoShowInput = z.object({
  bookingId: z.string().max(100),
  participantUserId: z.string().max(100),
  sessionId: z.string().max(100).optional(),
});

export const getBookingInput = z.object({
  bookingId: z.string().max(100),
});

export const listMineInput = z.object({
  cursor: z.string().max(100).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  states: z.array(z.string().max(100)).max(15).optional(),
});

export const listSessionsInput = z.object({
  bookingId: z.string().max(100),
});

export type CreateSoloInput = z.infer<typeof createSoloInput>;
export type CreateGroupInput = z.infer<typeof createGroupInput>;
export type CreateSeriesInput = z.infer<typeof createSeriesInput>;
export type CreateGroupSeriesInput = z.infer<typeof createGroupSeriesInput>;
export type BookingActionInput = z.infer<typeof bookingActionInput>;
export type ConfirmInviteInput = z.infer<typeof confirmInviteInput>;
export type DeclineInviteInput = z.infer<typeof declineInviteInput>;
export type WithdrawInviteInput = z.infer<typeof withdrawInviteInput>;
export type ReconfirmInput = z.infer<typeof reconfirmInput>;
export type WithdrawInput = z.infer<typeof withdrawInput>;
export type ProposeRescheduleInput = z.infer<typeof proposeRescheduleInput>;
export type CompleteSessionInput = z.infer<typeof completeSessionInput>;
export type SetMeetingLinkInput = z.infer<typeof setMeetingLinkInput>;
export type MarkAttendanceInput = z.infer<typeof markAttendanceInput>;
