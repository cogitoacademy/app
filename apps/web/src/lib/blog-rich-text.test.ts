import { describe, expect, test } from "bun:test";
import type { BlogBlock } from "@cogito-app/api/modules/blog/blog.types";
import {
  blogBlocksToTiptap,
  tiptapToBlogBlocks,
  normalizeBlogHref,
} from "./blog-rich-text";

describe("blog rich text", () => {
  test("round trips formatting, image placement and all existing blocks", () => {
    const blocks: BlogBlock[] = [
      { type: "heading", level: 2, text: "Lessons" },
      {
        type: "paragraph",
        runs: [
          { text: "Learn " },
          {
            text: "together",
            bold: true,
            italic: true,
            href: "https://example.com",
          },
        ],
      },
      {
        type: "image",
        mediaId: "image-1",
        alt: "Students learning",
        caption: "At Cogito",
      },
      { type: "paragraph", runs: [{ text: "After the image" }] },
      { type: "list", style: "unordered", items: [[{ text: "First" }]] },
      { type: "list", style: "ordered", items: [[{ text: "Second" }]] },
      { type: "quote", runs: [{ text: "Keep going" }], attribution: "Gita" },
      {
        type: "callout",
        title: "Try this",
        runs: [{ text: "Practice", bold: true }],
      },
      {
        type: "embed",
        provider: "tiktok",
        url: "https://www.tiktok.com/@cogito/video/123",
        posterMediaId: "poster",
      },
    ];
    expect(tiptapToBlogBlocks(blogBlocksToTiptap(blocks))).toEqual(blocks);
  });
  test("does not persist preview URLs and ignores blank trailing paragraphs", () => {
    expect(
      tiptapToBlogBlocks({
        type: "doc",
        content: [
          {
            type: "blogImage",
            attrs: {
              mediaId: "m",
              alt: "Photo",
              src: "https://cdn.test/photo.webp",
              caption: "",
            },
          },
          { type: "paragraph" },
        ],
      }),
    ).toEqual([{ type: "image", mediaId: "m", alt: "Photo" }]);
  });
  test("empty editor saves an empty body", () => {
    expect(tiptapToBlogBlocks(blogBlocksToTiptap([]))).toEqual([]);
  });
});

test("blog link toolbar accepts web links and rejects unsupported targets", () => {
  expect(normalizeBlogHref("example.com/article")).toBe(
    "https://example.com/article",
  );
  expect(normalizeBlogHref("https://example.com")).toBe("https://example.com");
  for (const target of [
    "",
    "javascript:alert(1)",
    "mailto:hello@example.com",
    "/page",
    "#section",
  ])
    expect(normalizeBlogHref(target)).toBeNull();
});
