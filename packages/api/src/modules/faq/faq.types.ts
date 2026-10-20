import { z } from "zod";

import type { FaqRichTextDocument } from "@cogito-app/db/schema/faq";
export type {
  FaqRichTextBlock,
  FaqRichTextDocument,
  FaqRichTextRun,
} from "@cogito-app/db/schema/faq";
import {
  faqAnswerRichTextSchema,
  faqQuestionRichTextSchema,
} from "./faq-rich-text";

export const FAQ_LANDING_MAX_ITEMS = 6;

export const faqAnswerBlockSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("paragraph"),
      text: z.string().trim().min(1).max(5_000),
    })
    .strict(),
  z
    .object({
      type: z.literal("list"),
      style: z.enum(["ordered", "unordered"]),
      items: z.array(z.string().trim().min(1).max(2_000)).min(1).max(50),
    })
    .strict(),
]);

export const faqAnswerBlocksSchema = z
  .array(faqAnswerBlockSchema)
  .min(1)
  .max(50);

const faqFieldsSchema = z
  .object({
    questionEnRich: faqQuestionRichTextSchema,
    questionIdRich: faqQuestionRichTextSchema.nullable().optional(),
    answerEnRich: faqAnswerRichTextSchema,
    answerIdRich: faqAnswerRichTextSchema.nullable().optional(),
    isActive: z.boolean().default(true),
    showOnLanding: z.boolean().default(false),
  })
  .strict();

export const listPublicFaqInput = z
  .object({
    locale: z.enum(["en", "id"]).default("en"),
    surface: z.enum(["full", "landing"]).default("full"),
  })
  .strict();

export const listAdminFaqInput = z.object({}).strict();
export const createFaqInput = faqFieldsSchema;
export const updateFaqInput = faqFieldsSchema
  .extend({
    id: z.string().min(1),
    expectedVersion: z.number().int().positive(),
  })
  .strict();

export type FaqAnswerBlock = z.infer<typeof faqAnswerBlockSchema>;
export type ListPublicFaqInput = z.infer<typeof listPublicFaqInput>;
export type CreateFaqInput = z.infer<typeof createFaqInput>;
export type UpdateFaqInput = z.infer<typeof updateFaqInput>;

export type PublicFaqDto = {
  id: string;
  question: string;
  answer: FaqAnswerBlock[];
  questionRich: FaqRichTextDocument;
  answerRich: FaqRichTextDocument;
  sortOrder: number;
};

export type AdminFaqDto = {
  id: string;
  questionEn: string;
  questionId: string | null;
  answerEn: FaqAnswerBlock[];
  answerId: FaqAnswerBlock[] | null;
  questionEnRich: FaqRichTextDocument;
  questionIdRich: FaqRichTextDocument | null;
  answerEnRich: FaqRichTextDocument;
  answerIdRich: FaqRichTextDocument | null;
  isActive: boolean;
  showOnLanding: boolean;
  version: number;
  modifiedAt: string;
};
