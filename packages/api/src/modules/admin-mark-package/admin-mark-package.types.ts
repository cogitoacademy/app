import { z } from "zod";

const packageId = z.string().trim().min(1).max(100);
const packageCode = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Code must be a lowercase slug");
const packageName = z.string().trim().min(1).max(255);
const packageMarks = z.number().int().positive().max(1_000_000);
const packagePriceIdr = z.number().int().positive().max(1_000_000_000);

export const createMarkPackageInput = z.object({
  code: packageCode,
  name: packageName,
  marks: packageMarks,
  priceIdr: packagePriceIdr,
  isActive: z.boolean().default(true),
});

export const updateMarkPackageInput = z.object({
  id: packageId,
  name: packageName,
  marks: packageMarks,
  priceIdr: packagePriceIdr,
});

export const setMarkPackageActiveInput = z.object({
  id: packageId,
  isActive: z.boolean(),
});

export type CreateMarkPackageInput = z.infer<typeof createMarkPackageInput>;
export type UpdateMarkPackageInput = z.infer<typeof updateMarkPackageInput>;
export type SetMarkPackageActiveInput = z.infer<
  typeof setMarkPackageActiveInput
>;
