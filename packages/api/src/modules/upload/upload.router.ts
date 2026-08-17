import { protectedProcedure } from "../../procedures";
import { createUploadUrlInput } from "./upload.types";
import type { UploadHandler } from "./upload.handler";

export function createUploadRouter(handler: UploadHandler) {
  return {
    createUploadUrl: protectedProcedure
      .route({
        method: "POST",
        path: "/upload/create-url",
        tags: ["Uploads"],
        summary: "Create upload URL",
        description:
          "Returns a signed PUT URL (or a direct local URL in dev) for uploading a file with an allowed content type",
      })
      .input(createUploadUrlInput)
      .handler(handler.createUploadUrl),
  };
}
