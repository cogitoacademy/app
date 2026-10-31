import { createHash } from "node:crypto";
import type { ContentAdminRepo } from "../content-admin/content-admin.repo";
import type { PrivateKbStorage } from "../../lib/private-kb-storage";
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

export function createSanityClient(
  configuration: Pick<
    typeof env,
    | "SANITY_PROJECT_ID"
    | "SANITY_DATASET"
    | "SANITY_API_VERSION"
    | "SANITY_API_TOKEN"
  > = env,
): SanityClient {
  return createClient({
    projectId: configuration.SANITY_PROJECT_ID,
    dataset: configuration.SANITY_DATASET,
    apiVersion: configuration.SANITY_API_VERSION,
    useCdn: true,
    perspective: "published",
    ...(configuration.SANITY_API_TOKEN
      ? { token: configuration.SANITY_API_TOKEN }
      : {}),
  });
}

export function createContentService(deps: {
  client?: SanityClient;
  database?: ContentAdminRepo;
  privateStorage?: () => PrivateKbStorage;
  kbSource?: "sanity" | "database";
  ccSource?: "sanity" | "database";
  competitionPalette: CompetitionPaletteResolver;
}) {
  const client = deps.client ?? createSanityClient();

  async function listCompetitions(): Promise<CompetitionContent[]> {
    if (deps.ccSource === "database") {
      if (!deps.database) throw new Error("Calendar database adapter missing");
      const rows = await deps.database.events();
      const links = await deps.database.eventCategories();
      const palettes = await deps.competitionPalette.resolveCompetitionPalettes(
        links.map((link) => ({ id: link.subject_category.id })),
      );
      return rows.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        location: row.location,
        startDate: row.startDate.toISOString(),
        endDate: row.endDate.toISOString(),
        educationLevels: row.educationLevels,
        scale: row.scale,
        organizer: row.organizer,
        registrationDeadline: row.registrationDeadline?.toISOString() ?? null,
        registrationLink: row.registrationLink,
        socialMediaLink: row.socialMediaLink,
        categories: links.flatMap((link, index) =>
          link.calendar_event_category.eventId === row.id
            ? [
                {
                  id: link.subject_category.id,
                  name: link.subject_category.name,
                  coreCategory: link.subject_category.slug,
                  parentColors: palettes[index] ?? neutralCompetitionPalette,
                },
              ]
            : [],
        ),
      }));
    }
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
          const { key } = getSanityCompetitionCategoryLookup(
            category.coreCategory,
          );
          return {
            ...category,
            coreCategory: category.coreCategory ?? "",
            parentColors: paletteBySlug.get(slugsByCategory.get(key)!)!,
          };
        }),
    }));
  }

  async function listStudentResources(): Promise<StudentResourceContent[]> {
    if (deps.kbSource === "database") {
      if (!deps.database) throw new Error("KB database adapter missing");
      return deps.database.resources();
    }
    return client.fetch<StudentResourceContent[]>(studentResourcesQuery);
  }

  async function getStudentResourceFile(
    resourceId: string,
  ): Promise<StudentResourceFile | null> {
    if (deps.kbSource === "database") {
      if (!deps.database || !deps.privateStorage)
        throw new Error("Private KB adapter missing");
      const file = await deps.database.resourceFile(resourceId);
      if (!file) return null;
      const bytes = await deps.privateStorage().read(file.storageKey);
      if (
        bytes.length !== file.bytes ||
        createHash("sha256").update(bytes).digest("hex") !== file.sha256
      )
        throw new Error("Private KB integrity check failed");
      return {
        fileUrl: "",
        fileName: file.fileName,
        mimeType: "application/pdf",
        bytes,
      };
    }
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
