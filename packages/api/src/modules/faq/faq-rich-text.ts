import { z } from "zod";

import type {
  FaqAnswerBlock,
  FaqRichTextDocument,
  FaqRichTextRun,
} from "@cogito-app/db/schema/faq";

function isAllowedFaqHref(href: string) {
  for (const character of href) {
    const code = character.charCodeAt(0);
    if (code < 32 || code === 127 || character === "\\") return false;
  }
  if (href.startsWith("/") && !href.startsWith("//")) return true;
  if (href.startsWith("#") && href.length > 1) return true;

  try {
    return ["http:", "https:", "mailto:"].includes(new URL(href).protocol);
  } catch {
    return false;
  }
}

const faqRichTextRunSchema = z
  .object({
    text: z.string().max(5_000),
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    href: z
      .string()
      .trim()
      .min(1)
      .max(2_048)
      .refine(isAllowedFaqHref)
      .optional(),
  })
  .strict();

const faqParagraphSchema = z
  .object({
    type: z.literal("paragraph"),
    content: z.array(faqRichTextRunSchema).max(500),
  })
  .strict();

const faqListSchema = z
  .object({
    type: z.literal("list"),
    style: z.enum(["ordered", "unordered"]),
    items: z.array(z.array(faqRichTextRunSchema).max(100)).min(1).max(50),
  })
  .strict();

const faqRichTextDocumentBaseSchema = z
  .object({
    type: z.literal("doc"),
    blocks: z
      .array(z.discriminatedUnion("type", [faqParagraphSchema, faqListSchema]))
      .min(1)
      .max(50),
  })
  .strict();

function runsText(runs: FaqRichTextRun[]) {
  return runs.map(({ text }) => text).join("");
}

export function faqRichTextToPlainText(document: FaqRichTextDocument) {
  return document.blocks
    .flatMap((block) =>
      block.type === "paragraph"
        ? [runsText(block.content)]
        : block.items.map(runsText),
    )
    .filter(Boolean)
    .join("\n")
    .trim();
}

export const faqRichTextDocumentSchema = faqRichTextDocumentBaseSchema.refine(
  (document) => faqRichTextToPlainText(document).length <= 20_000,
  "FAQ content is too long.",
);

export const faqQuestionRichTextSchema = faqRichTextDocumentSchema
  .refine((document) => faqRichTextToPlainText(document).length > 0, {
    message: "Question is required.",
  })
  .refine((document) => faqRichTextToPlainText(document).length <= 500, {
    message: "Question must be 500 characters or fewer.",
  });

export const faqAnswerRichTextSchema = faqRichTextDocumentSchema
  .refine((document) => faqRichTextToPlainText(document).length > 0, {
    message: "Answer is required.",
  })
  .refine(
    (document) =>
      document.blocks.every(
        (block) =>
          block.type !== "list" ||
          block.items.every((item) => runsText(item).trim().length > 0),
      ),
    { message: "List items cannot be empty." },
  );

export function faqRichTextToAnswerBlocks(
  document: FaqRichTextDocument,
): FaqAnswerBlock[] {
  const blocks: FaqAnswerBlock[] = [];
  for (const block of document.blocks) {
    if (block.type === "paragraph") {
      const text = runsText(block.content).trim();
      if (text) blocks.push({ type: "paragraph", text });
      continue;
    }

    const items = block.items
      .map(runsText)
      .map((text) => text.trim())
      .filter(Boolean);
    if (items.length) blocks.push({ type: "list", style: block.style, items });
  }
  return blocks;
}

function textRun(text: string): FaqRichTextRun[] {
  return text ? [{ text }] : [];
}

export function faqPlainTextToRichText(text: string): FaqRichTextDocument {
  return {
    type: "doc",
    blocks: [{ type: "paragraph", content: textRun(text) }],
  };
}

export function faqAnswerBlocksToRichText(
  blocks: FaqAnswerBlock[],
): FaqRichTextDocument {
  return {
    type: "doc",
    blocks: blocks.map((block) =>
      block.type === "paragraph"
        ? { type: "paragraph", content: textRun(block.text) }
        : {
            type: "list",
            style: block.style,
            items: block.items.map(textRun),
          },
    ),
  };
}
