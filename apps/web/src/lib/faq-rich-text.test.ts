import { describe, expect, test } from "bun:test";

import {
  faqRichTextToPlainText,
  faqRichTextToTiptap,
  normalizeFaqHref,
  normalizeFaqRichTextDocument,
  tiptapToFaqRichText,
} from "./faq-rich-text";
import type { FaqRichTextDocument } from "@cogito-app/api/modules/faq/faq.types";

const document: FaqRichTextDocument = {
  type: "doc",
  blocks: [
    {
      type: "paragraph",
      content: [
        { text: "Read the " },
        { text: "guide", bold: true, href: "https://example.com/guide" },
        { text: "." },
      ],
    },
    {
      type: "list",
      style: "ordered",
      items: [[{ text: "First" }], [{ text: "Second", italic: true }]],
    },
  ],
};

describe("FAQ rich-text editor document", () => {
  test("normalizes missing rich documents from legacy plain text", () => {
    expect(normalizeFaqRichTextDocument(undefined, "Legacy question")).toEqual({
      type: "doc",
      blocks: [{ type: "paragraph", content: [{ text: "Legacy question" }] }],
    });
    expect(faqRichTextToTiptap(undefined)).toEqual({
      type: "doc",
      content: [{ type: "paragraph" }],
    });
  });
  test("round-trips the supported marks and list nodes", () => {
    const serialized = tiptapToFaqRichText(faqRichTextToTiptap(document));

    expect(serialized).toEqual(document);
    expect(faqRichTextToPlainText(serialized)).toBe(
      "Read the guide.\nFirst\nSecond",
    );
  });

  test("normalizes common links and rejects unsafe protocols", () => {
    expect(normalizeFaqHref("example.com/help")).toBe(
      "https://example.com/help",
    );
    expect(normalizeFaqHref("/help")).toBe("/help");
    expect(normalizeFaqHref("#contact")).toBe("#contact");
    expect(normalizeFaqHref("mailto:help@example.com")).toBe(
      "mailto:help@example.com",
    );
    expect(normalizeFaqHref("javascript:alert(1)")).toBeNull();
    expect(normalizeFaqHref("//example.com")).toBeNull();
  });
});
