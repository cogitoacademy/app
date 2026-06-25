import { z } from "zod";

export const updateProfileInput = z.object({
  phoneNumber: z.string().optional(),
  schoolName: z.string().optional(),
  gradeLevel: z.string().optional(),
  parentName: z.string().optional(),
  parentPhone: z.string().optional(),
  parentEmail: z.string().email().optional(),
});
