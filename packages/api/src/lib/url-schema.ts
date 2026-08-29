import { z } from "zod";

/** User-controlled external URL. Browser-rendered links must be HTTP(S) only. */
export const externalHttpUrl = z
  .string()
  .trim()
  .max(2048)
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  }, "URL must start with http:// or https://");
