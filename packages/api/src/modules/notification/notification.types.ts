import { z } from "zod";

export const listInput = z
  .object({
    unreadOnly: z.boolean().optional(),
    limit: z.number().min(1).max(100).optional(),
    cursor: z
      .string()
      .max(120)
      .regex(/^\d{4}-\d{2}-\d{2}T.*\|\S+$/, "Invalid notification cursor")
      .optional(),
  })
  .optional();

export const idInput = z.object({
  id: z.string().min(1).max(100),
});

export const updateReadStatusInput = z.object({
  ids: z.array(z.string().min(1).max(100)).min(1).max(100),
  isRead: z.boolean(),
});
