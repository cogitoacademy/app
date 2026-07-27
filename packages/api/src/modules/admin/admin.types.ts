import { z } from "zod";

export const listUsersInput = z
  .object({
    limit: z.number().min(1).max(100).default(50),
    offset: z.number().min(0).default(0),
  })
  .optional();

export const setRoleInput = z.object({
  userId: z.string().max(100),
  role: z.enum(["student", "tutor", "admin"]),
  expectedRole: z.enum(["student", "tutor", "admin"]),
});
