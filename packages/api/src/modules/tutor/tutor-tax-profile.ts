import { z } from "zod";

export const tutorTaxProfileInput = z.object({
  taxLegalName: z.string().trim().max(255).nullable().optional(),
  nik: z
    .string()
    .regex(/^\d{16}$/, "NIK must contain exactly 16 digits")
    .nullable()
    .optional(),
  npwp: z.string().trim().max(64).nullable().optional(),
});
