import { createClient, type SanityClient } from "@sanity/client";
import { defineQuery } from "groq";

import { env } from "@cogito-app/env/server";

import type {
  CompetitionContent,
  StudentResourceContent,
  StudentResourceFile,
} from "./content.types";

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

export function createContentService(deps: { client?: SanityClient }) {
  const client = deps.client ?? createSanityClient();

  async function listCompetitions(): Promise<CompetitionContent[]> {
    return client.fetch<CompetitionContent[]>(competitionsQuery);
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
