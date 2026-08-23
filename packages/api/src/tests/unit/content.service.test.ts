import { describe, expect, mock, test } from "bun:test";

import { createSanityClient } from "../../modules/content/content.service";
import { createContentService } from "../../modules/content/content.service";

describe("content service", () => {
  test("creates a published Sanity client from server configuration", () => {
    const client = createSanityClient();
    expect(client.config().perspective).toBe("published");
    expect(client.config().dataset).toBe("development");
  });

  test("fetches projected competitions, resources, and protected file metadata", async () => {
    const fetch = mock(
      async (query: string, params?: Record<string, string>) => {
        if (query.includes("studentResource") && params?.resourceId) {
          return {
            fileUrl: "https://cdn.example.test/resource.pdf",
            fileName: "resource.pdf",
            mimeType: "application/pdf",
          };
        }
        if (query.includes("studentResource")) {
          return [
            {
              id: "resource-1",
              title: "Research guide",
              description: null,
              category: "academic",
            },
          ];
        }
        return [
          {
            id: "competition-1",
            title: "English Competition",
            description: null,
            location: null,
            categories: [],
            educationLevels: [],
            startDate: "2026-09-01T00:00:00.000Z",
            endDate: "2026-09-02T00:00:00.000Z",
            scale: "national",
            organizer: null,
            registrationDeadline: null,
            registrationLink: null,
            socialMediaLink: null,
          },
        ];
      },
    );
    const service = createContentService({ client: { fetch } as any });

    await expect(service.listCompetitions()).resolves.toHaveLength(1);
    await expect(service.listStudentResources()).resolves.toHaveLength(1);
    await expect(service.getStudentResourceFile("resource-1")).resolves.toEqual(
      {
        fileUrl: "https://cdn.example.test/resource.pdf",
        fileName: "resource.pdf",
        mimeType: "application/pdf",
      },
    );
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
