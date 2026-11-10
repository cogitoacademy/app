import { z } from "zod";

// Operators approve non-personal identifiers and display labels; client text is never a label.
export const officeCampaignLabelsSchema = z
  .string()
  .max(16384)
  .transform((raw, ctx) => {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      ctx.addIssue({
        code: "custom",
        message:
          "must be a JSON object of approved campaign identifiers and labels",
      });
      return z.NEVER;
    }
  })
  .pipe(
    z
      .record(
        z
          .string()
          .regex(/^[a-z][a-z0-9_-]{0,63}$/)
          .refine((v) => !/\d{7}/.test(v)),
        z
          .string()
          .min(1)
          .max(80)
          .regex(/^[A-Za-z][A-Za-z0-9 ._()-]*$/)
          .refine((v) => v === v.trim() && !/\d{7}/.test(v)),
      )
      .refine((v) => Object.keys(v).length <= 100, "at most 100 campaigns"),
  );
