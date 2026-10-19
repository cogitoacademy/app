import { z } from "zod";

const id = z.string().trim().min(1).max(100);
const slug = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase kebab case");
const name = z.string().trim().min(1).max(255);
const optionalNameId = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z.string().trim().max(255).nullable().optional(),
);
const optionalDescription = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z.string().trim().max(1000).nullable().optional(),
);
const sortOrder = z.number().int().min(0).max(1_000_000);
const reason = z.string().trim().min(1).max(500);
const expectedVersion = z.number().int().positive();
const oklchColor = z
  .string()
  .trim()
  .regex(
    /^oklch\(\s*(\d*\.?\d+)\s+(\d*\.?\d+)\s+(\d*\.?\d+)\s*\)$/i,
    "Color must use opaque OKLCH syntax: oklch(L C H)",
  )
  .transform((value, ctx) => {
    const match = value.match(
      /^oklch\(\s*(\d*\.?\d+)\s+(\d*\.?\d+)\s+(\d*\.?\d+)\s*\)$/i,
    );
    if (!match) return z.NEVER;
    const [, lightnessText, chromaText, hueText] = match;
    const lightness = Number(lightnessText);
    const chroma = Number(chromaText);
    const hue = Number(hueText);
    if (
      !Number.isFinite(lightness) ||
      lightness < 0 ||
      lightness > 1 ||
      !Number.isFinite(chroma) ||
      chroma < 0 ||
      chroma > 0.5 ||
      !Number.isFinite(hue) ||
      hue < 0 ||
      hue > 360
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "OKLCH components must be within L 0-1, C 0-0.5, H 0-360",
      });
      return z.NEVER;
    }
    return `oklch(${lightness} ${chroma} ${hue})`;
  });

export const competitionPaletteInput = z
  .object({
    lightTextColor: oklchColor,
    lightBackgroundColor: oklchColor,
    darkTextColor: oklchColor,
    darkBackgroundColor: oklchColor,
  })
  .strict();

const competitionPalettePatchInput = z
  .object({
    lightTextColor: oklchColor.optional(),
    lightBackgroundColor: oklchColor.optional(),
    darkTextColor: oklchColor.optional(),
    darkBackgroundColor: oklchColor.optional(),
  })
  .strict();

export const listCompetitionCatalogInput = z
  .object({
    query: z.string().trim().max(200).optional(),
    includeArchived: z.boolean().default(true),
  })
  .strict();

export const getCompetitionCatalogEntryInput = z.object({ id }).strict();
export const previewCompetitionCatalogImpactInput = z.object({ id }).strict();

export const createCompetitionParentInput = z
  .object({
    slug,
    name,
    nameId: optionalNameId,
    description: optionalDescription,
    descriptionId: optionalDescription,
    ...competitionPaletteInput.shape,
    sortOrder: sortOrder.default(0),
    reason,
  })
  .strict();

export const createCompetitionSpecializationInput = z
  .object({
    parentId: id,
    slug,
    name,
    nameId: optionalNameId,
    description: optionalDescription,
    descriptionId: optionalDescription,
    sortOrder: sortOrder.default(0),
    reason,
  })
  .strict();

export const updateCompetitionCatalogEntryInput = z
  .object({
    id,
    expectedVersion,
    name: name.optional(),
    nameId: optionalNameId,
    description: optionalDescription,
    descriptionId: optionalDescription,
    ...competitionPalettePatchInput.shape,
    sortOrder: sortOrder.optional(),
    reason,
  })
  .refine(
    ({
      name,
      nameId,
      description,
      descriptionId,
      sortOrder,
      lightTextColor,
      lightBackgroundColor,
      darkTextColor,
      darkBackgroundColor,
    }) =>
      name !== undefined ||
      nameId !== undefined ||
      description !== undefined ||
      descriptionId !== undefined ||
      sortOrder !== undefined ||
      lightTextColor !== undefined ||
      lightBackgroundColor !== undefined ||
      darkTextColor !== undefined ||
      darkBackgroundColor !== undefined,
    "At least one catalog field must change",
  )
  .strict();

export const moveCompetitionSpecializationInput = z
  .object({
    id,
    parentId: id,
    expectedVersion,
    reason,
  })
  .strict();

export const mutateCompetitionCatalogEntryInput = z
  .object({
    id,
    expectedVersion,
    reason,
  })
  .strict();

export type ListCompetitionCatalogInput = z.infer<
  typeof listCompetitionCatalogInput
>;
export type CompetitionPalette = z.infer<typeof competitionPaletteInput>;
export type CompetitionPaletteReference = {
  id?: string | null;
  slug?: string | null;
};
export type CreateCompetitionParentInput = z.infer<
  typeof createCompetitionParentInput
>;
export type CreateCompetitionSpecializationInput = z.infer<
  typeof createCompetitionSpecializationInput
>;
export type UpdateCompetitionCatalogEntryInput = z.infer<
  typeof updateCompetitionCatalogEntryInput
>;
export type MoveCompetitionSpecializationInput = z.infer<
  typeof moveCompetitionSpecializationInput
>;
export type MutateCompetitionCatalogEntryInput = z.infer<
  typeof mutateCompetitionCatalogEntryInput
>;
