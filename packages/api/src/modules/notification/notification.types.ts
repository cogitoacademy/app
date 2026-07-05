import { z } from "zod";

export const listInput = z
  .object({
    unreadOnly: z.boolean().optional(),
    limit: z.number().min(1).max(100).optional(),
    cursor: z.string().optional(),
  })
  .optional();

export const idInput = z.object({
  id: z.string().min(1),
});
