import { z } from "zod";

const nonBlankString = z
  .string()
  .max(255)
  .refine((val) => val.trim() !== "", "Cannot be blank");

export const updateProfileInput = z.object({
  phoneNumber: nonBlankString.optional(),
  schoolName: nonBlankString.optional(),
  gradeLevel: nonBlankString.optional(),
  parentName: nonBlankString.optional(),
  parentPhone: nonBlankString.optional(),
  parentEmail: z
    .string()
    .email()
    .max(320)
    .refine((val) => val.trim() !== "", "Cannot be blank")
    .optional(),
});
