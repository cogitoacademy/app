import { z } from "zod";
import { OVERRIDE_CATEGORIES, MARKS_ACTIONS } from "./admin-booking.service";

export const applyOverrideInput = z.object({
  bookingId: z.string().max(100),
  category: z.enum(OVERRIDE_CATEGORIES),
  reason: z.string().min(1).max(2000),
  affectedParticipants: z.array(z.string().max(100)).max(6).optional(),
  marksAction: z.enum(MARKS_ACTIONS).optional(),
  userNote: z.string().max(2000).optional(),
  internalNote: z.string().max(2000).optional(),
});

export const listOverridesInput = z.object({
  bookingId: z.string().max(100).optional(),
  limit: z.number().min(1).max(100).optional(),
  cursor: z.string().max(100).optional(),
  category: z.enum(OVERRIDE_CATEGORIES).optional(),
  urgency: z.enum(["high", "medium", "low"]).optional(),
  escalated: z.boolean().optional(),
});

export const getBookingStateHistoryInput = z.object({
  bookingId: z.string().max(100),
});

export const adminRefundInput = z.object({
  paymentId: z.string().max(100),
  reason: z.string().min(1).max(2000),
});

export const setMeetingLinkInput = z.object({
  bookingId: z.string().max(100),
  url: z.string().url().max(2048),
});
