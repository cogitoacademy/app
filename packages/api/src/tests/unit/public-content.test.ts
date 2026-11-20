import { describe, expect, mock, test } from "bun:test";
import { createRouterClient } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";

import type { Context } from "../../context";
import type { DbType } from "../../lib/db";
import { createPublicContentRouter } from "../../modules/public-content/public-content.router";
import { createPublicContentHandler } from "../../modules/public-content/public-content.handler";
import { createPublicContentRepo } from "../../modules/public-content/public-content.repo";
import type {
  PublicCalendarEventRow,
  PublicTutorRow,
} from "../../modules/public-content/public-content.repo";
import {
  createPublicContentService,
  toPublicCalendarEventDto,
  toPublicTutorDto,
} from "../../modules/public-content/public-content.service";
import { listPublicCalendarInput } from "../../modules/public-content/public-content.types";

function makeSensitiveRow() {
  return {
    id: "profile-public-id",
    shortBio: "A public tutor bio",
    affiliation: "Public affiliation",
    education: [
      {
        university: "Public University",
        degree: "Public Degree",
        futureEducationField: "FUTURE_EDUCATION_SENTINEL",
      },
    ],
    achievements: [
      {
        competitionName: "Public Competition",
        year: 2025,
        awards: ["Finalist"],
        futureAchievementField: "FUTURE_ACHIEVEMENT_SENTINEL",
      },
    ],
    experiences: [
      {
        role: "Public Role",
        organization: "Public Organization",
        startYear: 2022,
        endYear: null,
        description: "Public experience",
        futureExperienceField: "FUTURE_EXPERIENCE_SENTINEL",
      },
    ],
    modality: "offline",
    user: {
      name: "Public Name",
      image: "https://example.test/tutor.png",
      id: "PRIVATE_USER_ID_SENTINEL",
      email: "PRIVATE_EMAIL_SENTINEL",
      futureUserField: "FUTURE_USER_SENTINEL",
    },
    subjects: [
      {
        subjectId: "subject-id",
        subject: {
          id: "subject-id",
          slug: "public-specialization",
          name: "Public Specialization",
          nameId: "Spesialisasi Publik",
          parentId: "category-id",
          isActive: true,
          futureSubjectField: "FUTURE_SUBJECT_SENTINEL",
          parent: {
            id: "category-id",
            parentId: null,
            slug: "public-category",
            name: "Public Category",
            nameId: "Kategori Publik",
            isActive: true,
            lightTextColor: "oklch(0.2 0.02 250)",
            lightBackgroundColor: "oklch(0.96 0.03 250)",
            darkTextColor: "oklch(0.92 0.02 250)",
            darkBackgroundColor: "oklch(0.25 0.04 250)",
            futureParentField: "FUTURE_PARENT_SENTINEL",
          },
        },
      },
    ],
    userId: "PRIVATE_PROFILE_OWNER_SENTINEL",
    prices: { "1": 987654321 },
    baseRatesIdr: { online: 987654321 },
    bankName: "PRIVATE_BANK_SENTINEL",
    bankAccountNumber: "PRIVATE_ACCOUNT_SENTINEL",
    bankAccountHolderName: "PRIVATE_HOLDER_SENTINEL",
    bankAccountOpeningCity: "PRIVATE_BANK_CITY_SENTINEL",
    bankAccountOwnership: "trusted_person",
    bankTransferDisclaimerAccepted: true,
    onboardingStatus: "published",
    profileEditStatus: "pending_review",
    adminReviewNote: "PRIVATE_REVIEW_SENTINEL",
    pendingProfileChanges: {
      futurePrivateField: "FUTURE_PRIVATE_SENTINEL",
    },
    termsOfServiceAcceptedAt: new Date("2025-01-01T00:00:00Z"),
    termsOfServiceVersion: "PRIVATE_TERMS_SENTINEL",
    futureDatabaseColumn: "FUTURE_DATABASE_SENTINEL",
  } as unknown as PublicTutorRow;
}

describe("public content tutor projection", () => {
  test("catalog subjects sort by competition before specialization", () => {
    const row = makeSensitiveRow();
    const subject = row.subjects[0]!.subject!;
    row.subjects = [
      {
        subjectId: "z",
        subject: {
          ...subject,
          id: "z",
          slug: "z",
          parent: { ...subject.parent!, slug: "a-parent" },
        },
      },
      {
        subjectId: "b",
        subject: {
          ...subject,
          id: "b",
          slug: "b",
          parent: { ...subject.parent!, slug: "z-parent" },
        },
      },
      {
        subjectId: "a",
        subject: {
          ...subject,
          id: "a",
          slug: "a",
          parent: { ...subject.parent!, slug: "a-parent" },
        },
      },
    ];
    expect(toPublicTutorDto(row).subjects.map((entry) => entry.id)).toEqual([
      "a",
      "z",
      "b",
    ]);
  });

  test("malformed profile JSON and unresolved subjects are omitted from public data", () => {
    const row = {
      ...makeSensitiveRow(),
      education: { private: true },
      achievements: null,
      experiences: "invalid",
      subjects: [
        { subject: null },
        { subject: { isActive: true, parent: null } },
      ],
      modality: "unknown",
    } as unknown as PublicTutorRow;
    expect(toPublicTutorDto(row)).toMatchObject({
      education: [],
      achievements: [],
      experiences: [],
      subjects: [],
      modality: null,
    });
    row.user = null;
    expect(() => toPublicTutorDto(row)).toThrow("has no account");
  });
  test("uses a positive selection allowlist for every queried table", async () => {
    const findMany = mock(async (_query: unknown) => []);
    const db = {
      query: { tutorProfile: { findMany } },
    } as unknown as DbType;

    await createPublicContentRepo(db).listPublishedTutors();

    expect(findMany).toHaveBeenCalledTimes(1);
    const query = findMany.mock.calls[0]![0] as any;
    expect(Object.keys(query.columns)).toEqual([
      "id",
      "shortBio",
      "affiliation",
      "education",
      "achievements",
      "experiences",
      "modality",
    ]);
    expect(query.where).toBeDefined();
    expect(query.with.user.columns).toEqual({ name: true, image: true });
    expect(query.with.subjects.columns).toEqual({ subjectId: true });
    expect(query.with.subjects.with.subject.columns).toEqual({
      id: true,
      slug: true,
      name: true,
      nameId: true,
      parentId: true,
      isActive: true,
    });
    expect(query.with.subjects.with.subject.with.parent.columns).toEqual({
      id: true,
      slug: true,
      name: true,
      nameId: true,
      parentId: true,
      isActive: true,
      lightTextColor: true,
      lightBackgroundColor: true,
      darkTextColor: true,
      darkBackgroundColor: true,
    });
  });

  test("maps only the public DTO keys, including nested JSON and catalog rows", () => {
    const tutor = toPublicTutorDto(makeSensitiveRow());

    expect(Object.keys(tutor)).toEqual([
      "id",
      "name",
      "profileImageUrl",
      "shortBio",
      "affiliation",
      "education",
      "achievements",
      "experiences",
      "subjects",
      "modality",
    ]);
    expect(Object.keys(tutor.education[0]!)).toEqual(["university", "degree"]);
    expect(Object.keys(tutor.achievements[0]!)).toEqual([
      "competitionName",
      "year",
      "awards",
    ]);
    expect(Object.keys(tutor.experiences[0]!)).toEqual([
      "role",
      "organization",
      "startYear",
      "endYear",
      "description",
    ]);
    expect(Object.keys(tutor.subjects[0]!)).toEqual([
      "id",
      "slug",
      "name",
      "nameId",
      "parent",
    ]);
    expect(tutor.subjects[0]!.nameId).toBe("Spesialisasi Publik");
    expect(Object.keys(tutor.subjects[0]!.parent)).toEqual([
      "id",
      "slug",
      "name",
      "nameId",
      "lightTextColor",
      "lightBackgroundColor",
      "darkTextColor",
      "darkBackgroundColor",
    ]);
    expect(tutor.subjects[0]!.parent).toEqual({
      id: "category-id",
      slug: "public-category",
      name: "Public Category",
      nameId: "Kategori Publik",
      lightTextColor: "oklch(0.2 0.02 250)",
      lightBackgroundColor: "oklch(0.96 0.03 250)",
      darkTextColor: "oklch(0.92 0.02 250)",
      darkBackgroundColor: "oklch(0.25 0.04 250)",
    });
    expect(tutor.modality).toBe("offline");
    expect("locations" in tutor).toBe(false);
    expect("userId" in tutor).toBe(false);
    expect("prices" in tutor).toBe(false);

    const serialized = JSON.stringify(tutor);
    for (const sentinel of [
      "PRIVATE_",
      "FUTURE_",
      "987654321",
      "futureDatabaseColumn",
    ]) {
      expect(serialized).not.toContain(sentinel);
    }
  });

  test("omits inactive child and parent catalog entries", () => {
    const inactiveChild = makeSensitiveRow();
    inactiveChild.subjects[0]!.subject!.isActive = false;
    expect(toPublicTutorDto(inactiveChild).subjects).toEqual([]);

    const inactiveParent = makeSensitiveRow();
    inactiveParent.subjects[0]!.subject!.parent!.isActive = false;
    expect(toPublicTutorDto(inactiveParent).subjects).toEqual([]);

    const nestedParent = makeSensitiveRow();
    nestedParent.subjects[0]!.subject!.parent!.parentId = "grandparent-id";
    expect(toPublicTutorDto(nestedParent).subjects).toEqual([]);
  });

  test("drops malformed nested profile data without exposing it", () => {
    const row = {
      ...makeSensitiveRow(),
      education: [null, { university: "University", degree: 42 }],
      achievements: [
        { competitionName: "Competition", year: 2025.5, awards: [] },
      ],
      experiences: [
        {
          role: "Tutor",
          organization: "School",
          startYear: 2022.5,
          endYear: null,
          description: "Experience",
        },
      ],
    } as unknown as PublicTutorRow;

    const tutor = toPublicTutorDto(row);
    expect(tutor.education).toEqual([]);
    expect(tutor.achievements).toEqual([]);
    expect(tutor.experiences).toEqual([]);
  });

  test("returns an empty array unchanged when there are no published profiles", async () => {
    const service = createPublicContentService({
      repo: { listPublishedTutors: async () => [] } as any,
    });

    expect(await service.listTutors()).toEqual([]);
  });

  test("lets a database failure propagate through the public RPC route", async () => {
    const failure = new Error("database unavailable");
    const service = createPublicContentService({
      repo: {
        listPublishedTutors: async () => {
          throw failure;
        },
      } as any,
    });
    const handler = {
      listTutors: async () => service.listTutors(),
    } as any;
    const client = createRouterClient(createPublicContentRouter(handler), {
      context: {} as Context,
    });

    await expect(client.tutors.list({})).rejects.toBe(failure);
  });
});

test("public tutor mapping rejects incomplete experience dates and nonarray awards", () => {
  const row = makeSensitiveRow();
  const dto = toPublicTutorDto({
    ...row,
    achievements: [{ competitionName: "Olympiad", year: 2026, awards: null }],
    experiences: [
      {
        role: "Tutor",
        organization: "School",
        startYear: 2020,
        endYear: 2021.5,
        description: "Teaching",
      },
      {
        role: "Tutor",
        organization: "School",
        startYear: 2020,
        endYear: 2021,
        description: null,
      },
    ],
  } as unknown as PublicTutorRow);
  expect(dto.achievements).toEqual([
    { competitionName: "Olympiad", year: 2026, awards: [] },
  ]);
  expect(dto.experiences).toEqual([]);
});

const calendarPalette = {
  lightTextColor: "oklch(0.2 0.02 250)",
  lightBackgroundColor: "oklch(0.96 0.03 250)",
  darkTextColor: "oklch(0.92 0.02 250)",
  darkBackgroundColor: "oklch(0.25 0.04 250)",
};

function makeCalendarRow(
  overrides: Partial<PublicCalendarEventRow> = {},
): PublicCalendarEventRow {
  return {
    id: "event-public-id",
    title: "English Competition",
    description: "English description",
    location: "Jakarta, Indonesia",
    startDate: new Date("2026-11-01T00:00:00.000Z"),
    endDate: new Date("2026-11-02T00:00:00.000Z"),
    educationLevels: ["sma"],
    scale: "national",
    organizer: "Organizer",
    registrationDeadline: new Date("2026-10-30T00:00:00.000Z"),
    registrationLink: "https://example.test/register",
    socialMediaLink: "https://example.test/social",
    categories: [
      {
        id: "category-public-id",
        slug: "competition-debate",
        name: "Debate",
        ...calendarPalette,
      },
      {
        id: "category-without-palette",
        slug: "competition-other",
        name: "Other",
        lightTextColor: "oklch(0.2 0.02 250)",
        lightBackgroundColor: null,
        darkTextColor: "oklch(0.92 0.02 250)",
        darkBackgroundColor: "oklch(0.25 0.04 250)",
      },
    ],
    ...overrides,
  };
}

describe("public competition calendar", () => {
  test("maps the app competition fields and category palette", () => {
    const dto = toPublicCalendarEventDto(makeCalendarRow());

    expect(dto).toMatchObject({
      id: "event-public-id",
      title: "English Competition",
      description: "English description",
      location: "Jakarta, Indonesia",
      startDate: "2026-11-01T00:00:00.000Z",
      endDate: "2026-11-02T00:00:00.000Z",
      registrationDeadline: "2026-10-30T00:00:00.000Z",
      registrationLink: "https://example.test/register",
      socialMediaLink: "https://example.test/social",
      educationLevels: ["sma"],
      scale: "national",
      organizer: "Organizer",
    });
    expect(dto.categories[0]).toEqual({
      id: "category-public-id",
      slug: "competition-debate",
      name: "Debate",
      parentColors: calendarPalette,
    });
    expect(dto.categories[1]).toMatchObject({
      name: "Other",
      parentColors: null,
    });
  });

  test("maps only the strict public calendar keys and never leaks private fields", () => {
    const row = {
      ...makeCalendarRow(),
      sourceId: "PRIVATE_SOURCE_ID_SENTINEL",
      sourceHash: "PRIVATE_SOURCE_HASH_SENTINEL",
      version: 42,
      isActive: true,
      sortOrder: 7,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      futureDatabaseColumn: "FUTURE_DATABASE_SENTINEL",
      kbResource: "PRIVATE_KB_SENTINEL",
    } as unknown as PublicCalendarEventRow;

    const dto = toPublicCalendarEventDto(row);
    expect(Object.keys(dto)).toEqual([
      "id",
      "title",
      "description",
      "location",
      "startDate",
      "endDate",
      "categories",
      "educationLevels",
      "scale",
      "organizer",
      "registrationDeadline",
      "registrationLink",
      "socialMediaLink",
    ]);
    expect(Object.keys(dto.categories[0]!)).toEqual([
      "id",
      "slug",
      "name",
      "parentColors",
    ]);
    const serialized = JSON.stringify(dto);
    for (const sentinel of [
      "PRIVATE_",
      "FUTURE_",
      "sourceId",
      "sourceHash",
      "version",
      "isActive",
      "sortOrder",
      "createdAt",
      "updatedAt",
    ])
      expect(serialized).not.toContain(sentinel);
  });

  test("accepts the website locale input and rejects unknown locales or extra keys", () => {
    expect(listPublicCalendarInput.parse({})).toEqual({ locale: "en" });
    expect(listPublicCalendarInput.parse({ locale: "id" })).toEqual({
      locale: "id",
    });
    expect(listPublicCalendarInput.safeParse({ locale: "fr" }).success).toBe(
      false,
    );
    expect(
      listPublicCalendarInput.safeParse({ locale: "en", extra: true }).success,
    ).toBe(false);
  });

  test("serves calendar events through an anonymous route", async () => {
    const service = createPublicContentService({
      repo: {
        listActiveCalendarEvents: async () => [makeCalendarRow()],
        listPublishedTutors: async () => [],
      } as any,
    });
    const client = createRouterClient(
      createPublicContentRouter(createPublicContentHandler({ service })),
      { context: {} as Context },
    );

    const rows = await client.calendar.list({});
    expect(rows).toHaveLength(1);
    expect(rows[0]?.title).toBe("English Competition");
    await expect(client.calendar.list({ locale: "id" })).resolves.toMatchObject(
      [{ title: "English Competition" }],
    );
  });

  test("uses a positive calendar-event column allowlist", async () => {
    const chain: any = Promise.resolve([]);
    Object.assign(chain, {
      from: () => chain,
      where: () => chain,
      orderBy: () => chain,
    });
    const select = mock((_columns: unknown) => chain);
    const repo = createPublicContentRepo({ select } as unknown as DbType);

    await expect(repo.listActiveCalendarEvents()).resolves.toEqual([]);
    expect(select).toHaveBeenCalledTimes(1);
    expect(Object.keys(select.mock.calls[0]![0] as object)).toEqual([
      "id",
      "title",
      "description",
      "location",
      "startDate",
      "endDate",
      "educationLevels",
      "scale",
      "organizer",
      "registrationDeadline",
      "registrationLink",
      "socialMediaLink",
    ]);
  });

  test("resolves the anonymous HTTP route at /rpc/publicContent/calendar/list", async () => {
    const handler = {
      listTutors: async () => [],
      listCalendar: async ({ input }: { input: { locale: string } }) => [
        { locale: input.locale },
      ],
    } as any;
    const rpc = new RPCHandler({
      publicContent: createPublicContentRouter(handler),
    });
    const { matched, response } = await rpc.handle(
      new Request("http://localhost/rpc/publicContent/calendar/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ json: { locale: "id" } }),
      }),
      { prefix: "/rpc", context: {} as Context },
    );
    expect(matched).toBe(true);
    expect(response?.status).toBe(200);
    await expect(response?.json()).resolves.toMatchObject({
      json: [{ locale: "id" }],
    });
  });
});
