import { z } from "zod";

const filterIds = z
  .array(z.string().min(1).max(100))
  .max(50)
  .refine((ids) => new Set(ids).size === ids.length, {
    message: "filter IDs must not contain duplicates",
  })
  .optional();

export const listPublishedInput = z
  .object({
    search: z.string().max(200).optional(),
    expertise: z.string().max(255).optional(),
    categoryId: z.string().min(1).max(100).optional(),
    subjectId: z.string().min(1).max(100).optional(),
    categoryIds: filterIds,
    subjectIds: filterIds,
    modality: z.enum(["online", "offline", "both"]).optional(),
    limit: z.number().min(1).max(50).default(20),
    offset: z.number().min(0).default(0),
  })
  .optional();

// Keep the endpoint's input explicit so the RPC client sends the standard
// `{ json: {} }` envelope instead of an empty request body. An empty body is
// parsed as an internal error by the fetch handler before z.void() can accept
// it, which made tutor discovery fail in the browser.
export const listSubjectsInput = z.object({});

export const getProfileInput = z.object({
  tutorId: z.string().max(100),
});
