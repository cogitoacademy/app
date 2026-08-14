import type { StoragePort } from "../../lib/storage";
import {
  InvalidFilenameError,
  UnsupportedContentTypeError,
} from "./upload.errors";
import {
  ALLOWED_CONTENT_TYPES,
  MAX_UPLOAD_BYTES,
  type CreateUploadUrlInput,
} from "./upload.types";

export function sanitizeFilename(filename: string): string {
  const base = filename.replace(/\\/g, "/").split("/").pop() ?? "";
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, "_");
  const safe = cleaned.replace(/\.{2,}/g, ".").replace(/^\.+/, "");
  return safe.slice(0, 100) || "file";
}

export function createUploadService(deps: { storage: StoragePort }) {
  async function createUploadUrl(userId: string, input: CreateUploadUrlInput) {
    if (!ALLOWED_CONTENT_TYPES.includes(input.contentType)) {
      throw new UnsupportedContentTypeError(input.contentType);
    }
    if (
      !input.filename ||
      input.filename.includes("..") ||
      input.filename.startsWith("/")
    ) {
      throw new InvalidFilenameError(input.filename);
    }

    const filename = sanitizeFilename(input.filename);
    const key = `${userId}/${crypto.randomUUID()}-${filename}`;
    const { url, method } = await deps.storage.getSignedUploadUrl(
      key,
      input.contentType,
    );

    return {
      uploadUrl: url,
      key,
      publicUrl: deps.storage.resolvePublicUrl(key),
      contentType: input.contentType,
      maxBytes: MAX_UPLOAD_BYTES,
      method,
    };
  }

  function resolvePublicUrl(key: string): string {
    return deps.storage.resolvePublicUrl(key);
  }

  return { createUploadUrl, resolvePublicUrl };
}

export type UploadService = ReturnType<typeof createUploadService>;
