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
            categories: [
              { id: "sanity-category", name: "Other", coreCategory: "other" },
              { id: "sanity-mun", name: "MUN", coreCategory: " mun " },
              null,
            ],
            educationLevels: [],
            startDate: "2026-09-01T00:00:00.000Z",
            endDate: "2026-09-02T00:00:00.000Z",
            scale: "national",
            organizer: null,
            registrationDeadline: null,
            registrationLink: null,
            socialMediaLink: null,
          },
          {
            id: "competition-uncategorized",
            title: "Uncategorized Competition",
            description: null,
            location: null,
            categories: null,
            educationLevels: [],
            startDate: "2026-10-01T00:00:00.000Z",
            endDate: "2026-10-02T00:00:00.000Z",
            scale: null,
            organizer: null,
            registrationDeadline: null,
            registrationLink: null,
            socialMediaLink: null,
          },
        ];
      },
    );
    const resolveCompetitionPalettes = mock(
      async (
        references: readonly { id?: string | null; slug?: string | null }[],
      ) => references.map(() => null),
    );
    const service = createContentService({
      client: { fetch } as any,
      competitionPalette: {
        resolveCompetitionPalettes,
        resolveCompetitionPalette: async () => null,
      },
    });

    const competitions = await service.listCompetitions();
    expect(competitions).toHaveLength(2);
    expect(competitions[0]?.categories).toHaveLength(2);
    expect(competitions[0]?.categories[1]?.coreCategory).toBe(" mun ");
    expect(resolveCompetitionPalettes.mock.calls[0]?.[0]).toEqual([
      { slug: "other" },
      { slug: "competition-model-united-nations" },
    ]);
    expect(competitions[0]?.categories[0]?.parentColors).toEqual({
      lightTextColor: "oklch(0.2036 0.0029 247.97)",
      lightBackgroundColor: "oklch(0.9616 0.0011 247.83)",
      darkTextColor: "oklch(0.977 0.0007 247.83)",
      darkBackgroundColor: "oklch(0.2888 0.0039 264.5)",
    });
    expect(competitions[1]?.categories).toEqual([]);
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
