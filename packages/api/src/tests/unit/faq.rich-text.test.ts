import { describe, expect, test } from "bun:test";
import {
  faqAnswerBlocksToRichText,
  faqAnswerRichTextSchema,
  faqPlainTextToRichText,
  faqQuestionRichTextSchema,
  faqRichTextDocumentSchema,
  faqRichTextToAnswerBlocks,
  faqRichTextToPlainText,
} from "../../modules/faq/faq-rich-text";

describe("FAQ rich text", () => {
  test("flattens paragraphs and list items into readable text", () => {
    const document = {
      type: "doc" as const,
      blocks: [
        {
          type: "paragraph" as const,
          content: [{ text: " First " }, { text: "line " }],
        },
        { type: "paragraph" as const, content: [] },
        {
          type: "list" as const,
          style: "ordered" as const,
          items: [[{ text: "Second" }], [{ text: "Third" }]],
        },
      ],
    };
    expect(faqRichTextToPlainText(document)).toBe("First line \nSecond\nThird");
    expect(faqRichTextToAnswerBlocks(document)).toEqual([
      { type: "paragraph", text: "First line" },
      { type: "list", style: "ordered", items: ["Second", "Third"] },
    ]);
  });

  test("omits empty converted paragraphs and lists and supports both directions", () => {
    expect(
      faqRichTextToAnswerBlocks({
        type: "doc",
        blocks: [
          { type: "paragraph", content: [{ text: "   " }] },
          { type: "list", style: "unordered", items: [[{ text: " " }]] },
        ],
      }),
    ).toEqual([]);
    expect(faqPlainTextToRichText("").blocks[0]).toEqual({
      type: "paragraph",
      content: [],
    });
    expect(
      faqAnswerBlocksToRichText([
        { type: "paragraph", text: "Answer" },
        { type: "list", style: "unordered", items: ["One", "Two"] },
      ]).blocks,
    ).toEqual([
      { type: "paragraph", content: [{ text: "Answer" }] },
      {
        type: "list",
        style: "unordered",
        items: [[{ text: "One" }], [{ text: "Two" }]],
      },
    ]);
  });

  test("accepts safe links and rejects unsafe or unsupported schemes", () => {
    const accepts = [
      "/help",
      "#faq",
      "https://example.com",
      "http://example.com",
      "mailto:help@example.com",
    ];
    for (const href of accepts) {
      expect(
        faqRichTextDocumentSchema.safeParse({
          type: "doc",
          blocks: [{ type: "paragraph", content: [{ text: "link", href }] }],
        }).success,
      ).toBe(true);
    }
    const rejects = [
      "//example.com",
      "#",
      "javascript:alert(1)",
      "ftp://example.com",
      "bad url",
      "/bad\\path",
      "/line\nbreak",
    ];
    for (const href of rejects) {
      expect(
        faqRichTextDocumentSchema.safeParse({
          type: "doc",
          blocks: [{ type: "paragraph", content: [{ text: "link", href }] }],
        }).success,
      ).toBe(false);
    }
  });

  test("validates nonempty question, bounded content, and nonempty list items", () => {
    expect(
      faqQuestionRichTextSchema.safeParse(faqPlainTextToRichText("Q")).success,
    ).toBe(true);
    expect(
      faqQuestionRichTextSchema.safeParse(faqPlainTextToRichText(" ")).success,
    ).toBe(false);
    expect(
      faqQuestionRichTextSchema.safeParse(
        faqPlainTextToRichText("q".repeat(501)),
      ).success,
    ).toBe(false);
    expect(
      faqAnswerRichTextSchema.safeParse(faqPlainTextToRichText("A")).success,
    ).toBe(true);
    expect(
      faqAnswerRichTextSchema.safeParse({
        type: "doc",
        blocks: [
          { type: "list", style: "unordered", items: [[{ text: " " }]] },
        ],
      }).success,
    ).toBe(false);
    expect(
      faqAnswerRichTextSchema.safeParse({
        type: "doc",
        blocks: [
          { type: "paragraph", content: [{ text: "x".repeat(20_001) }] },
        ],
      }).success,
    ).toBe(false);
  });
});
