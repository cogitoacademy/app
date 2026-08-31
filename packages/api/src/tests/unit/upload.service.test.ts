import { describe, expect, test } from "bun:test";

import {
  createUploadService,
  sanitizeFilename,
} from "../../modules/upload/upload.service";
import {
  InvalidFilenameError,
  UnsupportedContentTypeError,
} from "../../modules/upload/upload.errors";
import { MAX_UPLOAD_BYTES } from "../../modules/upload/upload.types";
import type { StoragePort } from "../../lib/storage";

function makeStorage(overrides: Partial<StoragePort> = {}): StoragePort {
  return {
    put: async (key) => ({ key, url: `/uploads/${key}` }),
    getSignedUploadUrl: async (key) => ({
      url: `/uploads/${key}`,
      method: "POST" as const,
      fields: {},
    }),
    resolvePublicUrl: (key) => `/uploads/${key}`,
    ...overrides,
  };
}

describe("sanitizeFilename", () => {
  test("strips path separators and traversal", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("a/b/photo.png")).toBe("photo.png");
  });

  test("replaces unsafe characters", () => {
    expect(sanitizeFilename("my photo!.png")).toBe("my_photo_.png");
  });

  test("caps length and falls back to 'file'", () => {
    expect(sanitizeFilename("..")).toBe("file");
    expect(sanitizeFilename("")).toBe("file");
    expect(
      sanitizeFilename("a".repeat(500) + ".png").length,
    ).toBeLessThanOrEqual(100);
  });
});

describe("upload service createUploadUrl", () => {
  test("returns uploadUrl, key, publicUrl, contentType and maxBytes", async () => {
    const service = createUploadService({ storage: makeStorage() });
    const res = await service.createUploadUrl("user-1", {
      filename: "avatar.png",
      contentType: "image/png",
      contentLength: 1024,
    });

    expect(res.maxBytes).toBe(MAX_UPLOAD_BYTES);
    expect(res.contentType).toBe("image/png");
    expect(res.method).toBe("POST");
    expect(res.key).toMatch(/^user-1\/[0-9a-f-]{36}-avatar\.png$/);
    expect(res.publicUrl).toBe(`/uploads/${res.key}`);
    expect(res.uploadUrl).toBe(`/uploads/${res.key}`);
  });

  test("sanitizes filenames with path separators so the key stays bounded", async () => {
    const service = createUploadService({ storage: makeStorage() });
    const res = await service.createUploadUrl("user-1", {
      filename: "a/b/photo.png",
      contentType: "image/png",
      contentLength: 1024,
    });

    expect(res.key).toMatch(/^user-1\/[0-9a-f-]{36}-photo\.png$/);
    expect(res.key).not.toContain("/b/");
  });

  test("throws UnsupportedContentTypeError for disallowed content types", async () => {
    const service = createUploadService({ storage: makeStorage() });
    await expect(
      service.createUploadUrl("user-1", {
        filename: "notes.txt",
        contentType: "text/plain",
        contentLength: 1024,
      }),
    ).rejects.toThrow(UnsupportedContentTypeError);
  });

  test("throws InvalidFilenameError for traversal or absolute filenames", async () => {
    const service = createUploadService({ storage: makeStorage() });
    await expect(
      service.createUploadUrl("user-1", {
        filename: "../evil.png",
        contentType: "image/png",
        contentLength: 1024,
      }),
    ).rejects.toThrow(InvalidFilenameError);
    await expect(
      service.createUploadUrl("user-1", {
        filename: "/etc/passwd",
        contentType: "image/png",
        contentLength: 1024,
      }),
    ).rejects.toThrow(InvalidFilenameError);
  });

  test("uses the storage signed-URL result and public URL resolution", async () => {
    let signedKey = "";
    let signedContentLength = 0;
    const storage = makeStorage({
      getSignedUploadUrl: async (key, _contentType, contentLength) => {
        signedKey = key;
        signedContentLength = contentLength ?? 0;
        return {
          url: `https://signed.example/${key}?sig=abc`,
          method: "POST" as const,
          fields: {},
        };
      },
      resolvePublicUrl: (key) => `https://cdn.example/${key}`,
    });
    const service = createUploadService({ storage });
    const res = await service.createUploadUrl("user-1", {
      filename: "report.pdf",
      contentType: "application/pdf",
      contentLength: 2048,
    });

    expect(signedKey).toBe(res.key);
    expect(signedContentLength).toBe(2048);
    expect(res.uploadUrl).toBe(`https://signed.example/${res.key}?sig=abc`);
    expect(res.publicUrl).toBe(`https://cdn.example/${res.key}`);
  });
});

describe("upload service resolvePublicUrl", () => {
  test("delegates to the storage port", () => {
    const service = createUploadService({
      storage: makeStorage({
        resolvePublicUrl: (key) => `https://cdn.example/${key}`,
      }),
    });
    expect(service.resolvePublicUrl("user-1/uuid-avatar.png")).toBe(
      "https://cdn.example/user-1/uuid-avatar.png",
    );
  });
});
