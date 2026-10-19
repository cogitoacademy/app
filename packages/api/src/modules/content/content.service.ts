import { createClient, type SanityClient } from "@sanity/client";
import { defineQuery } from "groq";

import { env } from "@cogito-app/env/server";

import type {
  CompetitionContent,
  StudentResourceContent,
  StudentResourceFile,
} from "./content.types";
import type { CompetitionPaletteResolver } from "../competition-catalog";
import type { CompetitionPalette } from "../competition-catalog/competition-catalog.types";

const neutralCompetitionPalette: CompetitionPalette = {
  lightTextColor: "oklch(0.2036 0.0029 247.97)",
  lightBackgroundColor: "oklch(0.9616 0.0011 247.83)",
  darkTextColor: "oklch(0.977 0.0007 247.83)",
  darkBackgroundColor: "oklch(0.2888 0.0039 264.5)",
};

const legacySanityCategorySlugs: Record<string, string> = {
  mun: "competition-model-united-nations",
  olimpiade: "competition-olympiad",
  wsc: "competition-world-scholars-cup",
  kti: "competition-essay-writing",
  debat: "competition-debate",
  business: "competition-business",
  pidato: "competition-public-speaking",
};

type SanityCompetitionCategory = Omit<
  CompetitionContent["categories"][number],
  "parentColors" | "coreCategory"
> & { coreCategory: string | null };
type SanityCompetitionContent = Omit<CompetitionContent, "categories"> & {
  categories?: Array<SanityCompetitionCategory | null> | null;
};

function getSanityCompetitionCategoryLookup(
  coreCategory: string | null | undefined,
) {
  const key = coreCategory?.trim() ?? "";
  return {
    key,
    slug: legacySanityCategorySlugs[key.toLowerCase()] ?? key,
  };
}

const competitionsQuery = defineQuery(`
  *[_type == "competition" && defined(eventDate.startDate) && defined(eventDate.endDate)]
    | order(eventDate.startDate asc) {
      "id": _id,
      "title": coalesce(title[_key == "en"][0].value, title[0].value, "Untitled Competition"),
      "description": coalesce(description[_key == "en"][0].value, description[0].value),
      "location": coalesce(location[_key == "en"][0].value, location[0].value),
      "categories": categories[]->{
        "id": _id,
        name,
        coreCategory
      },
      educationLevels,
      "startDate": eventDate.startDate,
      "endDate": eventDate.endDate,
      scale,
      organizer,
      registrationDeadline,
      registrationLink,
      socialMediaLink
    }
`);

const studentResourcesQuery = defineQuery(`
  *[_type == "studentResource"] | order(title asc) {
    "id": _id,
    title,
    description,
    category
  }
`);

const studentResourceFileQuery = defineQuery(`
  *[_type == "studentResource" && _id == $resourceId][0] {
    "fileUrl": file.asset->url,
    "fileName": file.asset->originalFilename,
    "mimeType": file.asset->mimeType
  }
`);

export function createSanityClient(): SanityClient {
  return createClient({
    projectId: env.SANITY_PROJECT_ID,
    dataset: env.SANITY_DATASET,
    apiVersion: env.SANITY_API_VERSION,
    useCdn: true,
    perspective: "published",
    ...(env.SANITY_API_TOKEN ? { token: env.SANITY_API_TOKEN } : {}),
  });
}

export function createContentService(deps: {
  client?: SanityClient;
  competitionPalette: CompetitionPaletteResolver;
}) {
  const client = deps.client ?? createSanityClient();

  async function listCompetitions(): Promise<CompetitionContent[]> {
    const competitions =
      await client.fetch<SanityCompetitionContent[]>(competitionsQuery);
    const slugsByCategory = new Map<string, string>();
    for (const competition of competitions) {
      for (const category of (competition.categories ?? []).filter(
        (value): value is SanityCompetitionCategory => value !== null,
      )) {
        const { key, slug } = getSanityCompetitionCategoryLookup(
          category.coreCategory,
        );
        slugsByCategory.set(key, slug);
      }
    }
    const slugs = [...new Set(slugsByCategory.values())];
    const palettes = await deps.competitionPalette.resolveCompetitionPalettes(
      slugs.map((slug) => ({ slug })),
    );
    const paletteBySlug = new Map(
      slugs.map((slug, index) => [
        slug,
        palettes[index] ?? neutralCompetitionPalette,
      ]),
    );
    return competitions.map((competition) => ({
      ...competition,
      categories: (competition.categories ?? [])
        .filter(
          (category): category is SanityCompetitionCategory =>
            category !== null,
        )
        .map((category) => {
          const { key, slug } = getSanityCompetitionCategoryLookup(
            category.coreCategory,
          );
          return {
            ...category,
            coreCategory: category.coreCategory ?? "",
            parentColors:
              paletteBySlug.get(slugsByCategory.get(key) ?? slug) ??
              neutralCompetitionPalette,
          };
        }),
    }));
  }

  async function listStudentResources(): Promise<StudentResourceContent[]> {
    return client.fetch<StudentResourceContent[]>(studentResourcesQuery);
  }

  async function getStudentResourceFile(
    resourceId: string,
  ): Promise<StudentResourceFile | null> {
    return client.fetch<StudentResourceFile | null>(studentResourceFileQuery, {
      resourceId,
    });
  }

  return {
    listCompetitions,
    listStudentResources,
    getStudentResourceFile,
  };
}

export type ContentService = ReturnType<typeof createContentService>;
