import { z } from "zod";

export const ALLOWED_CONTENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
] as const;

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export const createUploadUrlInput = z.object({
  filename: z
    .string()
    .min(1)
    .max(255)
    .refine((s) => !s.includes("..") && !s.startsWith("/"), "invalid filename"),
  contentType: z.enum(ALLOWED_CONTENT_TYPES),
  contentLength: z.number().int().min(1).max(MAX_UPLOAD_BYTES),
});

export type CreateUploadUrlInput = z.infer<typeof createUploadUrlInput>;
export type AllowedContentType = (typeof ALLOWED_CONTENT_TYPES)[number];
