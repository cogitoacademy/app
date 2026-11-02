import { describe, expect, test } from "bun:test";
import type { BlogBlock } from "@cogito-app/api/modules/blog/blog.types";
import { assertBodyImageAlts, missingBodyImageAlts } from "./blog-body-alt";

const paragraph: BlogBlock = { type: "paragraph", runs: [{ text: "Text" }] };

describe("blog body image alt text", () => {
  test("reports the position of each image without alt text", () => {
    const body: BlogBlock[] = [
      paragraph,
      { type: "image", mediaId: "image-1", alt: " " },
      paragraph,
      { type: "image", mediaId: "image-2", alt: "Students debating" },
      { type: "image", mediaId: "image-3", alt: "" },
    ];

    expect(missingBodyImageAlts(body)).toEqual([1, 3]);
  });

  test("passes when every image has alt text", () => {
    const body: BlogBlock[] = [
      { type: "image", mediaId: "image-1", alt: "Students debating" },
      paragraph,
    ];

    expect(() => assertBodyImageAlts(body)).not.toThrow();
  });

  test("blocks save with the image positions in the message", () => {
    const body: BlogBlock[] = [
      { type: "image", mediaId: "image-1", alt: "" },
      { type: "image", mediaId: "image-2", alt: "" },
    ];

    expect(() => assertBodyImageAlts(body)).toThrow(
      "Add alt text to body images 1, 2 before saving or publishing.",
    );
  });
});
