import { z } from "zod";
import { eventFields } from "../content-admin/content-admin.types";
import {
  blogBodySchema,
  blogKeyFactsSchema,
  blogFaqSchema,
} from "../blog/blog.types";
import { faqCategorySchema } from "../faq/faq-categories";
import { faqAnswerRichTextSchema } from "../faq/faq-rich-text";
import { createKolCampaignInput } from "../referral/referral.types";

export const officeAssetUrl = z
  .url()
  .max(2000)
  .refine((value) => {
    const url = new URL(value);
    return (
      url.origin === "https://office.cogitoacademy.id" &&
      !url.username &&
      !url.password &&
      !url.hash
    );
  }, "Assets must use https://office.cogitoacademy.id/");
const id = z.string().min(1).max(200);
export const officeActionBody = z
  .object({
    dryRun: z.boolean(),
    idempotencyKey: z.uuid(),
    officeItemId: id,
    requestedBy: z.string().trim().min(1).max(200),
    approvedBy: z.string().trim().min(1).max(200),
    input: z.unknown(),
  })
  .strict();
const cover = officeAssetUrl.optional();
export const officeActionSchemas = {
  "referrals.createKolCampaign": createKolCampaignInput,
  "referrals.retireKolCampaign": z
    .object({ code: z.string().regex(/^[A-Za-z0-9]{4,32}$/) })
    .strict(),
  "calendar.saveDraft": z
    .object({
      ...eventFields.shape,
      isActive: z.never().optional(),
      id: id.optional(),
    })
    .strict()
    .refine(
      (v) => Date.parse(v.endDate) >= Date.parse(v.startDate),
      "End must be at or after start",
    ),
  "calendar.publish": z.object({ id }).strict(),
  "blog.saveDraft": z
    .object({
      id: id.optional(),
      lang: z.enum(["id", "en"]),
      title: z.string().trim().min(1).max(200),
      body: blogBodySchema,
      category: id,
      coverImageUrl: cover,
      seoTitle: z.string().max(60).optional(),
      metaDescription: z.string().max(155).optional(),
      lead: z.string().max(1000).optional(),
      keyFacts: blogKeyFactsSchema.optional(),
      faq: blogFaqSchema.optional(),
    })
    .strict(),
  "blog.publish": z.object({ id, lang: z.enum(["id", "en"]) }).strict(),
  "activities.saveDraft": z
    .object({
      id: id.optional(),
      title: z.string().trim().min(1).max(500),
      shortDescription: z.string().trim().min(1).max(2000),
      location: z.string().trim().min(1).max(1000),
      dateTime: z.iso.datetime({ offset: true }),
      body: faqAnswerRichTextSchema,
      coverImageUrl: cover,
    })
    .strict(),
  "activities.publish": z.object({ id }).strict(),
  "faq.saveDraft": z
    .object({
      id: id.optional(),
      question: z.string().trim().min(1).max(500),
      answer: z.string().trim().min(1).max(20000),
      category: faqCategorySchema,
      onLanding: z.boolean(),
    })
    .strict(),
  "faq.publish": z.object({ id }).strict(),
  "knowledge.addDraft": z
    .object({
      title: z.string().trim().min(1).max(500),
      description: z.string().max(20000).nullable(),
      category: id,
      fileUrl: officeAssetUrl,
    })
    .strict(),
} as const;
export type OfficeActionName = keyof typeof officeActionSchemas;
export function parseOfficeAction(name: string, input: unknown) {
  if (!Object.hasOwn(officeActionSchemas, name))
    throw new Error("OFFICE_ACTION_DENIED");
  return officeActionSchemas[name as OfficeActionName].parse(input);
}

export async function downloadOfficeAsset(
  url: string,
  maxBytes: number,
  fetcher: typeof fetch = fetch,
) {
  officeAssetUrl.parse(url);
  const response = await fetcher(url, {
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok || !response.body)
    throw new Error("OFFICE_ASSET_UNAVAILABLE");
  const length = Number(response.headers.get("content-length"));
  if (length > maxBytes) throw new Error("OFFICE_ASSET_TOO_LARGE");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      // eslint-disable-next-line no-await-in-loop -- Bound each streamed chunk before reading another.
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) throw new Error("OFFICE_ASSET_TOO_LARGE");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const bytes = Buffer.concat(chunks);
  return { bytes, contentType: response.headers.get("content-type") };
}
