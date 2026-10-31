import { z } from "zod";
import { faqAnswerRichTextSchema } from "../faq/faq-rich-text";
export const activityFields = z
  .object({
    titleEn: z.string().trim().min(1).max(500),
    titleId: z.string().trim().max(500).nullable(),
    descriptionEn: z.string().trim().min(1).max(2000),
    descriptionId: z.string().trim().max(2000).nullable(),
    coverUrl: z
      .url()
      .max(2000)
      .refine((v) => /^https?:\/\//.test(v))
      .nullable(),
    location: z.string().trim().min(1).max(1000),
    startAt: z.iso.datetime({ offset: true }),
    bodyEn: faqAnswerRichTextSchema,
    bodyId: faqAnswerRichTextSchema.nullable(),
    state: z.enum(["draft", "published", "cancelled", "postponed"]),
  })
  .strict();
export const saveActivityInput = activityFields
  .safeExtend({
    id: z.string().optional(),
    expectedVersion: z.number().int().positive().optional(),
  })
  .refine((v) => !v.id || !!v.expectedVersion, {
    message: "Version required for updates",
  });
