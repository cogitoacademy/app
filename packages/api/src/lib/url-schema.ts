import { z } from "zod";

/** User-controlled external URL. Browser-rendered links must be HTTP(S) only. */
export const externalHttpUrl = z
  .string()
  .trim()
  .max(2048)
  .url()
  .refine((value) => {
    try {
      const protocol = new URL(value).protocol;
      return protocol === "http:" || protocol === "https:";
    } catch {
      return false;
    }
  }, "URL must start with http:// or https://");

/**
 * Profile images may also use the local storage URL returned by the upload
 * module in development. Restrict it to the upload mount and reject traversal.
 */
export const profileImageUrl = z.union([
  externalHttpUrl,
  z
    .string()
    .trim()
    .max(2048)
    .refine(
      (value) =>
        value.startsWith("/uploads/") &&
        !value.includes("..") &&
        !value.includes("\\"),
      "URL must be an HTTP(S) URL or a local /uploads path",
    ),
]);
