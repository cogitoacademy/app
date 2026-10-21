import { describe, expect, mock, test } from "bun:test";
import { createRouterClient } from "@orpc/server";

import type { Context } from "../../context";
import type { DbType } from "../../lib/db";
import { createPublicContentRouter } from "../../modules/public-content/public-content.router";
import { createPublicContentRepo } from "../../modules/public-content/public-content.repo";
import type { PublicTutorRow } from "../../modules/public-content/public-content.repo";
import {
  createPublicContentService,
  toPublicTutorDto,
} from "../../modules/public-content/public-content.service";

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
