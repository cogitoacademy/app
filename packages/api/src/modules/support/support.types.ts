import { z } from "zod";

export const SUPPORT_CATEGORIES = [
  "tutor_late",
  "tutor_no_show",
  "technical",
  "payment",
  "other",
] as const;

export const SUPPORT_STATUSES = [
  "open",
  "in_progress",
  "resolved",
  "closed",
] as const;

export const createTicketInput = z.object({
  category: z.enum(SUPPORT_CATEGORIES),
  bookingId: z.string().min(1).max(100).optional(),
  description: z.string().min(1, "Description is required").max(2000),
});

export const listTicketsInput = z
  .object({
    status: z.enum(SUPPORT_STATUSES).optional(),
    limit: z.number().int().min(1).max(100).optional(),
  })
  .optional();

export const adminListTicketsInput = z
  .object({
    status: z.enum(SUPPORT_STATUSES).optional(),
    limit: z.number().int().min(1).max(100).default(50),
    offset: z.number().int().min(0).default(0),
  })
  .optional();

export const adminResolveTicketInput = z.object({
  ticketId: z.string().min(1).max(100),
  resolution: z.string().min(1, "Resolution is required").max(2000),
});
