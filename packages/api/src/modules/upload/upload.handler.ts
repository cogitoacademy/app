import type { Context } from "../../context";
import { withDomainMap } from "../../lib/handler-utils";
import type { CreateUploadUrlInput } from "./upload.types";
import type { UploadService } from "./upload.service";
import { mapUploadError } from "./upload.errors";

export function createUploadHandler(deps: { uploadService: UploadService }) {
  async function createUploadUrl({
    context,
    input,
  }: {
    context: Context;
    input: CreateUploadUrlInput;
  }) {
    const user = context.session!.user;
    return withDomainMap(
      () => deps.uploadService.createUploadUrl(user.id, input),
      mapUploadError,
    );
  }

  return { createUploadUrl };
}

export type UploadHandler = ReturnType<typeof createUploadHandler>;
