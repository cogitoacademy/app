import { describe, expect, test } from "bun:test";

import {
  ALLOWED_DOCUMENT_TYPES,
  ALLOWED_IMAGE_TYPES,
  createUploadUrlInput,
  MAX_UPLOAD_BYTES,
} from "../../modules/upload/upload.types";

describe("createUploadUrlInput", () => {
  test("accepts allowed image content types (photo flows)", () => {
    for (const contentType of ALLOWED_IMAGE_TYPES) {
      const result = createUploadUrlInput.safeParse({
        filename: "photo.png",
        contentType,
        contentLength: 1024,
      });
      expect(result.success).toBe(true);
    }
  });

  test("photo flow rejects application/pdf", () => {
    expect(
      createUploadUrlInput.safeParse({
        filename: "a.pdf",
        contentType: "application/pdf",
        contentLength: 10,
      }).success,
    ).toBe(false);
  });

  test("keeps application/pdf in the unreferenced document allowlist", () => {
    expect(ALLOWED_DOCUMENT_TYPES).toContain("application/pdf");
  });

  test("rejects disallowed content types", () => {
    const result = createUploadUrlInput.safeParse({
      filename: "notes.txt",
      contentType: "text/plain",
      contentLength: 1024,
    });
    expect(result.success).toBe(false);
  });

  test("rejects missing or empty filenames", () => {
    expect(
      createUploadUrlInput.safeParse({
        filename: "",
        contentType: "image/png",
        contentLength: 1024,
      }).success,
    ).toBe(false);
    expect(
      createUploadUrlInput.safeParse({
        contentType: "image/png",
        contentLength: 1024,
      }).success,
    ).toBe(false);
  });

  test("rejects filenames with path traversal or a leading slash", () => {
    expect(
      createUploadUrlInput.safeParse({
        filename: "a/../../x",
        contentType: "image/png",
        contentLength: 1024,
      }).success,
    ).toBe(false);
    expect(
      createUploadUrlInput.safeParse({
        filename: "/etc/passwd",
        contentType: "image/png",
        contentLength: 1024,
      }).success,
    ).toBe(false);
  });

  test("rejects filenames longer than 255 chars", () => {
    const result = createUploadUrlInput.safeParse({
      filename: "a".repeat(256),
      contentType: "image/png",
      contentLength: 1024,
    });
    expect(result.success).toBe(false);
  });

  test("rejects content lengths outside the bounded integer range", () => {
    for (const contentLength of [0, MAX_UPLOAD_BYTES + 1, 1.5]) {
      const result = createUploadUrlInput.safeParse({
        filename: "photo.png",
        contentType: "image/png",
        contentLength,
      });
      expect(result.success).toBe(false);
    }
  });
});
