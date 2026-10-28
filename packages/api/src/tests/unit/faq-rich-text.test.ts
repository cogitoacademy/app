import { describe, expect, test } from "bun:test";
import type {
  FaqAnswerBlock,
  FaqRichTextDocument,
} from "@cogito-app/db/schema/faq";
import {
  faqAnswerBlocksToRichText,
  faqAnswerRichTextSchema,
  faqPlainTextToRichText,
  faqRichTextDocumentSchema,
  faqQuestionRichTextSchema,
  faqRichTextToAnswerBlocks,
  faqRichTextToPlainText,
} from "../../modules/faq/faq-rich-text";

function paragraph(...text: string[]): FaqRichTextDocument {
  return {
    type: "doc",
    blocks: [
      { type: "paragraph", content: text.map((value) => ({ text: value })) },
    ],
  };
}

describe("FAQ rich-text conversion and validation", () => {
  test("allows safe URL forms and rejects dangerous or malformed links", () => {
    const accepted = [
      "/help",
      "#details",
      "https://example.test/help",
      "http://example.test/help",
      "mailto:help@example.test",
    ];
    const rejected = [
      "//example.test/help",
      "#",
      "javascript:alert(1)",
      "ftp://example.test/file",
      "http://[",
      "/bad\\path",
      "/bad\u0001path",
      "/bad\u007fpath",
    ];
    for (const href of accepted) {
      expect(
        faqRichTextDocumentSchema.safeParse({
          type: "doc",
          blocks: [{ type: "paragraph", content: [{ text: "Help", href }] }],
        }).success,
      ).toBe(true);
    }
    for (const href of rejected) {
      expect(
        faqRichTextDocumentSchema.safeParse({
          type: "doc",
          blocks: [{ type: "paragraph", content: [{ text: "Help", href }] }],
        }).success,
      ).toBe(false);
    }
  });

  test("projects paragraphs and lists to plain text without blank entries", () => {
    const document: FaqRichTextDocument = {
      type: "doc",
      blocks: [
        { type: "paragraph", content: [{ text: "Read " }, { text: "this." }] },
        { type: "paragraph", content: [] },
        {
          type: "list",
          style: "unordered",
          items: [[{ text: "First" }], [], [{ text: "Second" }]],
        },
      ],
    };
    expect(faqRichTextToPlainText(document)).toBe("Read this.\nFirst\nSecond");
    expect(
      faqRichTextToAnswerBlocks({
        type: "doc",
        blocks: [
          { type: "paragraph", content: [{ text: "  Keep me  " }] },
          { type: "paragraph", content: [{ text: "  " }] },
          {
            type: "list",
            style: "ordered",
            items: [[{ text: " One " }], [{ text: " " }], [{ text: "Two" }]],
          },
          { type: "list", style: "unordered", items: [[{ text: " " }]] },
        ],
      }),
    ).toEqual([
      { type: "paragraph", text: "Keep me" },
      { type: "list", style: "ordered", items: ["One", "Two"] },
    ]);
  });

  test("round-trips paragraph and list compatibility blocks including empty text", () => {
    expect(faqPlainTextToRichText("A plain answer")).toEqual(
      paragraph("A plain answer"),
    );
    expect(faqPlainTextToRichText("")).toEqual(paragraph());
    const blocks: FaqAnswerBlock[] = [
      { type: "paragraph", text: "A paragraph" },
      { type: "paragraph", text: "" },
      { type: "list", style: "ordered", items: ["First", ""] },
    ];
    expect(faqAnswerBlocksToRichText(blocks)).toEqual({
      type: "doc",
      blocks: [
        { type: "paragraph", content: [{ text: "A paragraph" }] },
        { type: "paragraph", content: [] },
        {
          type: "list",
          style: "ordered",
          items: [[{ text: "First" }], []],
        },
      ],
    });
  });

  test("answer validation rejects empty list entries", () => {
    expect(
      faqAnswerRichTextSchema.safeParse({
        type: "doc",
        blocks: [
          {
            type: "list",
            style: "ordered",
            items: [[{ text: "Useful" }], [{ text: "  " }]],
          },
        ],
      }).success,
    ).toBe(false);
  });

  test("question validation requires nonempty text and caps length", () => {
    expect(faqQuestionRichTextSchema.safeParse(paragraph("How?")).success).toBe(
      true,
    );
    expect(faqQuestionRichTextSchema.safeParse(paragraph("")).success).toBe(
      false,
    );
    expect(
      faqQuestionRichTextSchema.safeParse(paragraph("q".repeat(501))).success,
    ).toBe(false);
  });
});
