import { describe, expect, mock, test } from "bun:test";
import { createHash } from "node:crypto";

import { createSanityClient } from "../../modules/content/content.service";
import { createContentService } from "../../modules/content/content.service";

describe("content service", () => {
  test("creates a published Sanity client from server configuration", () => {
    const client = createSanityClient();
    expect(client.config().perspective).toBe("published");
    expect(client.config().dataset).toBe("development");
    const authenticatedClient = createSanityClient({
      SANITY_PROJECT_ID: "project",
      SANITY_DATASET: "dataset",
      SANITY_API_VERSION: "2026-10-28",
      SANITY_API_TOKEN: "test-token",
    });
    expect(authenticatedClient.config().token).toBe("test-token");
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
              {
                id: "sanity-unclassified",
                name: "Unclassified",
                coreCategory: null,
              },
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
    expect(competitions[0]?.categories).toHaveLength(3);
    expect(competitions[0]?.categories[1]?.coreCategory).toBe(" mun ");
    expect(competitions[0]?.categories[2]?.coreCategory).toBe("");
    expect(resolveCompetitionPalettes.mock.calls[0]?.[0]).toEqual([
      { slug: "other" },
      { slug: "competition-model-united-nations" },
      { slug: "" },
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

  test("maps database competitions and falls back when a category palette is missing", async () => {
    const palette = {
      lightTextColor: "#111111",
      lightBackgroundColor: "#eeeeee",
      darkTextColor: "#ffffff",
      darkBackgroundColor: "#222222",
    };
    const eventStart = new Date("2026-11-01T00:00:00.000Z");
    const deadline = new Date("2026-10-30T00:00:00.000Z");
    const eventRows = [
      {
        id: "event-1",
        title: "Competition One",
        description: null,
        location: "Online",
        startDate: eventStart,
        endDate: new Date("2026-11-02T00:00:00.000Z"),
        educationLevels: ["high-school"],
        scale: "national",
        organizer: null,
        registrationDeadline: deadline,
        registrationLink: null,
        socialMediaLink: null,
      },
      {
        id: "event-2",
        title: "Competition Two",
        description: "Description",
        location: null,
        startDate: eventStart,
        endDate: eventStart,
        educationLevels: [],
        scale: null,
        organizer: "Organizer",
        registrationDeadline: null,
        registrationLink: "https://example.test/register",
        socialMediaLink: "https://example.test/social",
      },
    ];
    const links = [
      {
        calendar_event_category: { eventId: "event-1" },
        subject_category: { id: "cat-1", name: "Olympiad", slug: "olimpiade" },
      },
      {
        calendar_event_category: { eventId: "event-1" },
        subject_category: { id: "cat-2", name: "Debate", slug: "debat" },
      },
      {
        calendar_event_category: { eventId: "other-event" },
        subject_category: { id: "cat-3", name: "Other", slug: "other" },
      },
    ];
    const resolveCompetitionPalettes = mock(async () => [palette, null, null]);
    const service = createContentService({
      database: {
        events: async () => eventRows,
        eventCategories: async () => links,
      } as any,
      competitionPalette: {
        resolveCompetitionPalettes,
        resolveCompetitionPalette: async () => null,
      },
      ccSource: "database",
    });

    const result = await service.listCompetitions();
    expect(resolveCompetitionPalettes).toHaveBeenCalledWith([
      { id: "cat-1" },
      { id: "cat-2" },
      { id: "cat-3" },
    ]);
    expect(result).toEqual([
      {
        id: "event-1",
        title: "Competition One",
        description: null,
        location: "Online",
        startDate: eventStart.toISOString(),
        endDate: "2026-11-02T00:00:00.000Z",
        educationLevels: ["high-school"],
        scale: "national",
        organizer: null,
        registrationDeadline: deadline.toISOString(),
        registrationLink: null,
        socialMediaLink: null,
        categories: [
          {
            id: "cat-1",
            name: "Olympiad",
            coreCategory: "olimpiade",
            parentColors: palette,
          },
          {
            id: "cat-2",
            name: "Debate",
            coreCategory: "debat",
            parentColors: {
              lightTextColor: "oklch(0.2036 0.0029 247.97)",
              lightBackgroundColor: "oklch(0.9616 0.0011 247.83)",
              darkTextColor: "oklch(0.977 0.0007 247.83)",
              darkBackgroundColor: "oklch(0.2888 0.0039 264.5)",
            },
          },
        ],
      },
      {
        id: "event-2",
        title: "Competition Two",
        description: "Description",
        location: null,
        startDate: eventStart.toISOString(),
        endDate: eventStart.toISOString(),
        educationLevels: [],
        scale: null,
        organizer: "Organizer",
        registrationDeadline: null,
        registrationLink: "https://example.test/register",
        socialMediaLink: "https://example.test/social",
        categories: [],
      },
    ]);
  });

  test("rejects missing database adapters and checks private file integrity", async () => {
    const palette = {
      resolveCompetitionPalettes: async () => [],
      resolveCompetitionPalette: async () => null,
    };
    const missingCalendarDatabase = createContentService({
      client: {} as any,
      competitionPalette: palette,
      ccSource: "database",
    });
    await expect(missingCalendarDatabase.listCompetitions()).rejects.toThrow(
      "Calendar database adapter missing",
    );

    const missingKnowledgeBankDatabase = createContentService({
      client: {} as any,
      competitionPalette: palette,
      kbSource: "database",
    });
    await expect(
      missingKnowledgeBankDatabase.listStudentResources(),
    ).rejects.toThrow("KB database adapter missing");
    await expect(
      missingKnowledgeBankDatabase.getStudentResourceFile("resource-1"),
    ).rejects.toThrow("Private KB adapter missing");

    const resources = [
      {
        id: "resource-1",
        title: "Guide",
        description: null,
        category: "guide",
      },
    ];
    const databaseResources = createContentService({
      competitionPalette: palette,
      kbSource: "database",
      database: { resources: async () => resources } as any,
    });
    await expect(databaseResources.listStudentResources()).resolves.toEqual(
      resources,
    );

    const file = {
      storageKey: "resource.pdf",
      bytes: 5,
      sha256: createHash("sha256").update("%PDF!").digest("hex"),
      fileName: "resource.pdf",
    };
    const privateStorage = mock(() => ({
      read: async () => new TextEncoder().encode("%PDF!"),
    }));
    const notFound = createContentService({
      client: {} as any,
      database: { resourceFile: async () => null } as any,
      privateStorage,
      competitionPalette: palette,
      kbSource: "database",
    });
    await expect(
      notFound.getStudentResourceFile("missing"),
    ).resolves.toBeNull();
    expect(privateStorage).not.toHaveBeenCalled();

    const validFile = createContentService({
      client: {} as any,
      database: { resourceFile: async () => file } as any,
      privateStorage,
      competitionPalette: palette,
      kbSource: "database",
    });
    await expect(
      validFile.getStudentResourceFile("resource-1"),
    ).resolves.toEqual({
      fileUrl: "",
      fileName: "resource.pdf",
      mimeType: "application/pdf",
      bytes: new TextEncoder().encode("%PDF!"),
    });

    const invalidFiles = [
      { ...file, bytes: 4 },
      { ...file, sha256: "0".repeat(64) },
    ];
    for (const invalidFile of invalidFiles) {
      const invalidService = createContentService({
        client: {} as any,
        database: { resourceFile: async () => invalidFile } as any,
        privateStorage,
        competitionPalette: palette,
        kbSource: "database",
      });
      await expect(
        invalidService.getStudentResourceFile("resource-1"),
      ).rejects.toThrow("Private KB integrity check failed");
    }
  });
});
