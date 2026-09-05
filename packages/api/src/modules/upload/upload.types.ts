import { z } from "zod";

export const ALLOWED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

// Unreferenced until a flow needs document uploads. Photo flows accept
// image types only; keep PDF out of the request schema so a PDF can never
// mint a photo-flow upload URL.
export const ALLOWED_DOCUMENT_TYPES = ["application/pdf"] as const;

/** @deprecated Use ALLOWED_IMAGE_TYPES / ALLOWED_DOCUMENT_TYPES instead. */
export const ALLOWED_CONTENT_TYPES = [
  ...ALLOWED_IMAGE_TYPES,
  ...ALLOWED_DOCUMENT_TYPES,
] as const;

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export const createUploadUrlInput = z.object({
  filename: z
    .string()
    .min(1)
    .max(255)
    .refine((s) => !s.includes("..") && !s.startsWith("/"), "invalid filename"),
  contentType: z.enum(ALLOWED_IMAGE_TYPES),
  contentLength: z.number().int().min(1).max(MAX_UPLOAD_BYTES),
});

export type CreateUploadUrlInput = z.infer<typeof createUploadUrlInput>;
export type AllowedContentType = (typeof ALLOWED_CONTENT_TYPES)[number];
export type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];
export type AllowedDocumentType = (typeof ALLOWED_DOCUMENT_TYPES)[number];
