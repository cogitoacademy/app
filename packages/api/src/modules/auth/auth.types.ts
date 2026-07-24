import { z } from "zod";

const nonBlankString = z
  .string()
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
    .refine((val) => val.trim() !== "", "Cannot be blank")
    .optional(),
});
