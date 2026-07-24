import { z } from "zod";
import { OVERRIDE_CATEGORIES, MARKS_ACTIONS } from "./admin-booking.service";

export const applyOverrideInput = z.object({
  bookingId: z.string(),
  category: z.enum(OVERRIDE_CATEGORIES),
  reason: z.string().min(1),
  affectedParticipants: z.array(z.string()).optional(),
  marksAction: z.enum(MARKS_ACTIONS).optional(),
  userNote: z.string().optional(),
  internalNote: z.string().optional(),
});

export const listOverridesInput = z.object({
  bookingId: z.string().optional(),
  limit: z.number().min(1).max(100).optional(),
  cursor: z.string().optional(),
});

export const getBookingStateHistoryInput = z.object({
  bookingId: z.string(),
});

export const adminRefundInput = z.object({
  paymentId: z.string(),
  reason: z.string().min(1),
});
