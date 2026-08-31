import { describe, expect, test } from "bun:test";

import { createUploadHandler } from "../../modules/upload/upload.handler";
import { UnsupportedContentTypeError } from "../../modules/upload/upload.errors";

describe("uploadHandler", () => {
  test("createUploadUrl calls the service with the session user id", async () => {
    let calledWith: unknown;
    const service = {
      createUploadUrl: async (userId: string, input: unknown) => {
        calledWith = { userId, input };
        return { uploadUrl: "/uploads/k", key: "k", maxBytes: 1 };
      },
    };
    const handler = createUploadHandler({ uploadService: service as never });
    const result = await handler.createUploadUrl({
      context: { session: { user: { id: "u1" } } } as never,
      input: {
        filename: "a.png",
        contentType: "image/png",
        contentLength: 1024,
      } as never,
    });

    expect(calledWith).toEqual({
      userId: "u1",
      input: {
        filename: "a.png",
        contentType: "image/png",
        contentLength: 1024,
      },
    });
    expect(result).toEqual({ uploadUrl: "/uploads/k", key: "k", maxBytes: 1 });
  });

  test("maps service DomainErrors to ORPC errors", async () => {
    const service = {
      createUploadUrl: async () => {
        throw new UnsupportedContentTypeError("text/plain");
      },
    };
    const handler = createUploadHandler({ uploadService: service as never });
    await expect(
      handler.createUploadUrl({
        context: { session: { user: { id: "u1" } } } as never,
        input: {
          filename: "a.txt",
          contentType: "text/plain",
          contentLength: 1024,
        } as never,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});
