import { afterAll, describe, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";

import { db } from "@cogito-app/db";
import {
  subjectCategory,
  tutorInvite,
  tutorProfile,
  tutorProfileSubject,
  user,
} from "@cogito-app/db/schema";
import {
  createTestClient,
  createTestContext,
  setUserRole,
  signUpAndSignIn,
} from "../helpers/test-client";

function assertSafeCogitoTestDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  let parsedUrl: URL | undefined;
  try {
    if (databaseUrl) parsedUrl = new URL(databaseUrl);
  } catch {
    parsedUrl = undefined;
  }

  const host = parsedUrl?.hostname.toLowerCase();
  const databaseName = parsedUrl?.pathname.replace(/^\/+/, "");
  if (
    process.env.NODE_ENV !== "test" ||
    databaseName !== "cogito-test" ||
    !["localhost", "127.0.0.1", "::1"].includes(host ?? "")
  ) {
    throw new Error(
      "Public tutor integration fixtures require the local cogito-test database.",
    );
  }
}

describe("publicContent.tutors.list", () => {
  const fixtureId = Date.now();
  const fixtureEmails: string[] = [];
  const fixtureProfileIds: string[] = [];
  const fixtureCategoryIds: string[] = [];
  const fixtureSpecializationIds: string[] = [];

  async function cleanupFixtures() {
    if (
      fixtureEmails.length === 0 &&
      fixtureProfileIds.length === 0 &&
      fixtureCategoryIds.length === 0 &&
      fixtureSpecializationIds.length === 0
    ) {
      return;
    }
    assertSafeCogitoTestDatabase();

    if (fixtureSpecializationIds.length > 0) {
      await db
        .delete(tutorProfileSubject)
        .where(
          inArray(tutorProfileSubject.subjectId, fixtureSpecializationIds),
        );
    }
    if (fixtureProfileIds.length > 0) {
      await db
        .delete(tutorProfile)
        .where(inArray(tutorProfile.id, fixtureProfileIds));
    }
    if (fixtureEmails.length > 0) {
      await db.delete(user).where(inArray(user.email, fixtureEmails));
    }
    if (fixtureSpecializationIds.length > 0) {
      await db
        .delete(subjectCategory)
        .where(inArray(subjectCategory.id, fixtureSpecializationIds));
    }
    if (fixtureCategoryIds.length > 0) {
      await db
        .delete(subjectCategory)
        .where(inArray(subjectCategory.id, fixtureCategoryIds));
    }

    fixtureEmails.length = 0;
    fixtureProfileIds.length = 0;
    fixtureCategoryIds.length = 0;
    fixtureSpecializationIds.length = 0;
  }

  async function createProfile(name: string, status: "published" | "draft") {
    const email = `${name.toLowerCase().replaceAll(" ", ".")}.${fixtureId}@cogito.test`;
    fixtureEmails.push(email);
    const authResult = await signUpAndSignIn(email, "Test1234!", name);
    const context = await createTestContext(authResult.cookie);
    const tutorId = context.session?.user?.id;
    if (!tutorId) throw new Error("Tutor fixture session was not created");
    await setUserRole(tutorId, "tutor");
    await db
      .update(user)
      .set({ image: "https://example.test/public-tutor.png" })
      .where(eq(user.id, tutorId));

    const [invite] = await db
      .insert(tutorInvite)
      .values({
        email,
        displayName: name,
        token: `public-content-${status}-${fixtureId}-${name}`,
        status: "accepted",
        invitedBy: tutorId,
        acceptedBy: tutorId,
        acceptedAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
      })
      .returning();

    const [profile] = await db
      .insert(tutorProfile)
      .values({
        userId: tutorId,
        inviteId: invite!.id,
        shortBio: "Public bio",
        affiliation: "Public affiliation",
        education: [
          { university: "Public University", degree: "Public Degree" },
        ],
        achievements: [
          {
            competitionName: "Public Competition",
            year: 2025,
            awards: ["Finalist"],
          },
        ],
        experiences: [
          {
            role: "Public Role",
            organization: "Public Organization",
            startYear: 2022,
            endYear: null,
            description: "Public experience",
          },
        ],
        modality: "both",
        prices: { "1": 987654321 },
        baseRatesIdr: { online: 987654321, offline: 987654321 },
        bankName: "PRIVATE_BANK_SENTINEL",
        bankAccountNumber: "PRIVATE_ACCOUNT_SENTINEL",
        bankAccountHolderName: "PRIVATE_HOLDER_SENTINEL",
        bankAccountOpeningCity: "PRIVATE_BANK_CITY_SENTINEL",
        bankAccountOwnership: "trusted_person",
        bankTransferDisclaimerAccepted: true,
        termsOfServiceAcceptedAt: new Date("2025-01-01T00:00:00Z"),
        termsOfServiceVersion: "PRIVATE_TERMS_SENTINEL",
        onboardingStatus: status,
        profileEditStatus: "pending_review",
        adminReviewNote: "PRIVATE_REVIEW_SENTINEL",
        pendingProfileChanges: {
          profileImageUrl: "PRIVATE_PENDING_IMAGE_SENTINEL",
        },
        publishedAt: status === "published" ? new Date() : null,
      })
      .returning({ id: tutorProfile.id });

    fixtureProfileIds.push(profile!.id);
    return profile!.id;
  }

  async function createCategory(options: {
    slug: string;
    name: string;
    nameId: string;
    parentId?: string;
    isActive: boolean;
  }) {
    const [category] = await db
      .insert(subjectCategory)
      .values({
        parentId: options.parentId ?? null,
        slug: options.slug,
        name: options.name,
        nameId: options.nameId,
        isActive: options.isActive,
        ...(options.parentId
          ? {}
          : {
              lightTextColor: "oklch(0.2 0.02 250)",
              lightBackgroundColor: "oklch(0.96 0.03 250)",
              darkTextColor: "oklch(0.92 0.02 250)",
              darkBackgroundColor: "oklch(0.25 0.04 250)",
            }),
      })
      .returning({ id: subjectCategory.id });

    if (options.parentId) fixtureSpecializationIds.push(category!.id);
    else fixtureCategoryIds.push(category!.id);
    return category!.id;
  }

  afterAll(cleanupFixtures);

  test("allows anonymous reads, publishes only active catalog entries, and keeps student discovery gated", async () => {
    try {
      assertSafeCogitoTestDatabase();
      const anonymousClient = createTestClient(await createTestContext());
      const publishedProfileId = await createProfile(
        "Public Tutor",
        "published",
      );
      const draftProfileId = await createProfile("Draft Tutor", "draft");

      const activeCategoryId = await createCategory({
        slug: `t10-public-category-${fixtureId}`,
        name: "T10 Public Category",
        nameId: "Kategori Publik T10",
        isActive: true,
      });
      const activeSpecializationId = await createCategory({
        parentId: activeCategoryId,
        slug: `t10-public-specialization-${fixtureId}`,
        name: "T10 Public Specialization",
        nameId: "Spesialisasi Publik T10",
        isActive: true,
      });
      const inactiveSpecializationId = await createCategory({
        parentId: activeCategoryId,
        slug: `t10-public-inactive-specialization-${fixtureId}`,
        name: "T10 Inactive Specialization",
        nameId: "Spesialisasi Tidak Aktif T10",
        isActive: false,
      });
      const inactiveCategoryId = await createCategory({
        slug: `t10-public-inactive-category-${fixtureId}`,
        name: "T10 Inactive Category",
        nameId: "Kategori Tidak Aktif T10",
        isActive: false,
      });
      const activeSpecializationUnderInactiveCategoryId = await createCategory({
        parentId: inactiveCategoryId,
        slug: `t10-public-specialization-under-inactive-${fixtureId}`,
        name: "T10 Specialization Under Inactive Category",
        nameId: "Spesialisasi di Kategori Tidak Aktif T10",
        isActive: true,
      });

      await db.insert(tutorProfileSubject).values([
        {
          tutorProfileId: publishedProfileId,
          subjectId: activeSpecializationId,
        },
        {
          tutorProfileId: publishedProfileId,
          subjectId: inactiveSpecializationId,
        },
        {
          tutorProfileId: publishedProfileId,
          subjectId: activeSpecializationUnderInactiveCategoryId,
        },
      ]);

      const tutors = await anonymousClient.publicContent.tutors.list({});
      const tutor = tutors.find((entry) => entry.id === publishedProfileId);
      expect(tutor).toBeDefined();
      expect(tutors.some((entry) => entry.id === draftProfileId)).toBe(false);
      expect(tutor!.id).toBe(publishedProfileId);
      expect(tutor!.name).toBe("Public Tutor");
      expect(tutor!.profileImageUrl).toBe(
        "https://example.test/public-tutor.png",
      );
      expect(tutor!.modality).toBe("both");
      expect(Object.keys(tutor!)).toEqual([
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
      expect(tutor!.subjects).toEqual([
        {
          id: activeSpecializationId,
          slug: `t10-public-specialization-${fixtureId}`,
          name: "T10 Public Specialization",
          nameId: "Spesialisasi Publik T10",
          parent: {
            id: activeCategoryId,
            slug: `t10-public-category-${fixtureId}`,
            name: "T10 Public Category",
            nameId: "Kategori Publik T10",
            lightTextColor: "oklch(0.2 0.02 250)",
            lightBackgroundColor: "oklch(0.96 0.03 250)",
            darkTextColor: "oklch(0.92 0.02 250)",
            darkBackgroundColor: "oklch(0.25 0.04 250)",
          },
        },
      ]);
      const serialized = JSON.stringify(tutors);
      for (const sentinel of [
        "PRIVATE_BANK_SENTINEL",
        "PRIVATE_ACCOUNT_SENTINEL",
        "PRIVATE_HOLDER_SENTINEL",
        "PRIVATE_BANK_CITY_SENTINEL",
        "PRIVATE_TERMS_SENTINEL",
        "PRIVATE_REVIEW_SENTINEL",
        "PRIVATE_PENDING_IMAGE_SENTINEL",
        "987654321",
      ]) {
        expect(serialized).not.toContain(sentinel);
      }
      await expect(
        anonymousClient.tutors.listPublished({}),
      ).rejects.toMatchObject({
        code: "UNAUTHORIZED",
      });

      await db
        .delete(tutorProfile)
        .where(inArray(tutorProfile.id, [publishedProfileId, draftProfileId]));
      const remainingTutors = await anonymousClient.publicContent.tutors.list(
        {},
      );
      expect(
        remainingTutors.some((entry) =>
          [publishedProfileId, draftProfileId].includes(entry.id),
        ),
      ).toBe(false);
    } finally {
      await cleanupFixtures();
    }
  });
});
