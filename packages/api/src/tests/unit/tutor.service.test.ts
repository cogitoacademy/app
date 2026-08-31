import { describe, test, expect, mock } from "bun:test";
import {
  validateUpdateInput,
  validateSubmitForReview,
  createTutorService,
} from "../../modules/tutor/tutor.service";
import type { PricingPort } from "../../modules/pricing/pricing.service";
import {
  TutorProfileNotFoundError,
  InvalidTutorStatusError,
  TutorProfileIncompleteError,
  InvalidTutorPricingError,
  AvailabilitySlotOverlapError,
  OptimisticLockError,
  InvalidDateRangeError,
} from "../../modules/tutor/tutor.errors";

function makeProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: "tp1",
    displayName: "Dr. Smith",
    shortBio: "Experienced tutor",
    credentialsSummary: "PhD in Math",
    achievements: "National mathematics medalist (2025)",
    experiences: "Mathematics tutor (2024–2025)",
    sourcePhotoUrl: "https://example.com/source-photo.jpg",
    modality: "online",
    bankName: "BCA",
    bankAccountNumber: "1234567890",
    bankAccountHolderName: "Dr. Smith",
    bankAccountOpeningCity: "Jakarta Selatan",
    bankAccountOwnership: "self",
    bankTransferDisclaimerAccepted: true,
    prices: { "1": 50 },
    expertise: ["math"],
    subjects: [
      {
        subject: {
          id: "child-1",
          slug: "math-olympiad",
          name: "Mathematics Olympiad",
          description: null,
          isActive: true,
          parentId: "mother-1",
          parent: {
            id: "mother-1",
            slug: "olympiad",
            name: "Olympiad",
          },
        },
      },
    ],
    onboardingStatus: "draft",
    publishedAt: null,
    ...overrides,
  } as any;
}

const mockPricingPort: PricingPort = {
  validatePrices: () => null,
  computeSplit: (modality: string, pricePerStudent: number, size: number) => {
    const perStudent = Math.floor(pricePerStudent);
    return {
      perStudent,
      baseline: perStudent * size,
      tutorShare: Math.floor(perStudent * size * 0.8),
      cogitoTake: Math.floor(perStudent * size * 0.2),
      baselineCogitoTake: Math.floor(perStudent * size * 0.2),
      baselineTutorShare: Math.floor(perStudent * size * 0.8),
      extraTotal: 0,
      cogitoExtraTake: 0,
      tutorExtraShare: 0,
    };
  },
};

const failPricingPort: PricingPort = {
  ...mockPricingPort,
  validatePrices: () => "Prices are invalid",
};

const idrPricingPort: PricingPort = {
  ...mockPricingPort,
  validateBaseRates: () => null,
};

describe("Tutor Service", () => {
  describe("validateUpdateInput", () => {
    test("does not throw for draft profile with valid input", () => {
      expect(() =>
        validateUpdateInput(
          makeProfile({ onboardingStatus: "draft" }),
          { displayName: "New Name" },
          mockPricingPort,
        ),
      ).not.toThrow();
    });

    test("does not throw for changes_requested profile", () => {
      expect(() =>
        validateUpdateInput(
          makeProfile({ onboardingStatus: "changes_requested" }),
          { displayName: "Updated" },
          mockPricingPort,
        ),
      ).not.toThrow();
    });

    test("throws TutorProfileNotFoundError for null profile", () => {
      expect(() =>
        validateUpdateInput(null, { displayName: "X" }, mockPricingPort),
      ).toThrow(TutorProfileNotFoundError);
    });

    test("does not throw for published profile", () => {
      expect(() =>
        validateUpdateInput(
          makeProfile({ onboardingStatus: "published" }),
          { displayName: "X" },
          mockPricingPort,
        ),
      ).not.toThrow();
    });

    test("throws InvalidTutorPricingError when pricing validation fails", () => {
      expect(() =>
        validateUpdateInput(
          makeProfile({ onboardingStatus: "draft" }),
          { prices: { "1": 0 } },
          failPricingPort,
        ),
      ).toThrow(InvalidTutorPricingError);
    });

    test("does not throw when input has no prices (skip pricing validation)", () => {
      expect(() =>
        validateUpdateInput(
          makeProfile({ onboardingStatus: "draft" }),
          { displayName: "New Name" },
          failPricingPort,
        ),
      ).not.toThrow();
    });

    test("validates IDR base rates when updating a profile", () => {
      expect(() =>
        validateUpdateInput(
          makeProfile(),
          { baseRatesIdr: { online: 175_000 }, version: 1 },
          idrPricingPort,
        ),
      ).not.toThrow();
      expect(() =>
        validateUpdateInput(
          makeProfile(),
          { baseRatesIdr: { online: 45_000 }, version: 1 },
          {
            ...idrPricingPort,
            validateBaseRates: () => "Base rate is too low",
          },
        ),
      ).toThrow(InvalidTutorPricingError);
    });
  });

  describe("validateSubmitForReview", () => {
    test("does not throw for complete draft profile", () => {
      expect(() =>
        validateSubmitForReview(makeProfile(), mockPricingPort),
      ).not.toThrow();
    });

    test("throws TutorProfileNotFoundError for null profile", () => {
      expect(() => validateSubmitForReview(null, mockPricingPort)).toThrow(
        TutorProfileNotFoundError,
      );
    });

    test("throws InvalidTutorStatusError for invalid status", () => {
      expect(() =>
        validateSubmitForReview(
          makeProfile({ onboardingStatus: "pending_review" }),
          mockPricingPort,
        ),
      ).toThrow(InvalidTutorStatusError);
    });

    test("throws TutorProfileIncompleteError for missing required fields", () => {
      expect(() =>
        validateSubmitForReview(
          makeProfile({ displayName: null }),
          mockPricingPort,
        ),
      ).toThrow(TutorProfileIncompleteError);
    });

    test("accepts a structured competition achievement without legacy text", () => {
      expect(() =>
        validateSubmitForReview(
          makeProfile({
            achievements: null,
            competitionAchievements: [
              {
                competitionName: "Harvard Model United Nations",
                year: 2025,
                awards: ["Best Delegate"],
              },
            ],
          }),
          mockPricingPort,
        ),
      ).not.toThrow();
    });

    test("requires an achievement when legacy and structured values are empty", () => {
      expect(() =>
        validateSubmitForReview(
          makeProfile({ achievements: null, competitionAchievements: [] }),
          mockPricingPort,
        ),
      ).toThrow(TutorProfileIncompleteError);
    });

    test("requires payout account ownership and transfer disclaimer confirmation", () => {
      expect(() =>
        validateSubmitForReview(
          makeProfile({ bankAccountOwnership: null }),
          mockPricingPort,
        ),
      ).toThrow(TutorProfileIncompleteError);
      expect(() =>
        validateSubmitForReview(
          makeProfile({ bankTransferDisclaimerAccepted: false }),
          mockPricingPort,
        ),
      ).toThrow(TutorProfileIncompleteError);
    });

    test("throws TutorProfileIncompleteError for empty subjects", () => {
      expect(() =>
        validateSubmitForReview(makeProfile({ subjects: [] }), mockPricingPort),
      ).toThrow(TutorProfileIncompleteError);
    });

    test("rejects profiles that only retain archived subjects", () => {
      expect(() =>
        validateSubmitForReview(
          makeProfile({
            subjects: [
              {
                subjectId: "legacy-child",
                subject: {
                  ...makeProfile().subjects[0].subject,
                  isActive: false,
                },
              },
            ],
          }),
          mockPricingPort,
        ),
      ).toThrow(TutorProfileIncompleteError);
    });

    test("validates IDR base rates during review submission", () => {
      expect(() =>
        validateSubmitForReview(
          makeProfile({ baseRatesIdr: { online: 175_000 } }),
          idrPricingPort,
        ),
      ).not.toThrow();
      expect(() =>
        validateSubmitForReview(
          makeProfile({ baseRatesIdr: { online: 45_000 } }),
          {
            ...idrPricingPort,
            validateBaseRates: () => "Base rate is too low",
          },
        ),
      ).toThrow(InvalidTutorPricingError);
    });

    test("validates legacy Marks prices during review submission", () => {
      expect(() =>
        validateSubmitForReview(makeProfile(), failPricingPort),
      ).toThrow(InvalidTutorPricingError);
    });
  });

  describe("createTutorService", () => {
    function makeDeps(overrides: Record<string, unknown> = {}) {
      const mockProfile = makeProfile();
      return {
        tutorRepo: {
          getByUserId: mock(async () => mockProfile),
          updateProfileWithVersion: mock(async () => [mockProfile]),
          updateStatus: mock(async () => mockProfile),
          listAvailability: mock(async () => []),
          upsertAvailability: mock(async () => ({ id: "slot1" })),
          deleteAvailability: mock(async () => {}),
          deactivateFutureRecurringAvailability: mock(async () => {}),
        },
        pricingPort: mockPricingPort,
        auditPort: { record: mock(async () => {}) },
        db: {
          transaction: mock(async (fn: any) => {
            const tx = { execute: mock(async () => {}) };
            return fn(tx);
          }),
        },
        payout: { getTutorPayouts: mock(async () => []) },
        ...overrides,
      };
    }

    test("getMyProfile throws TutorProfileNotFoundError when not found", async () => {
      const deps = makeDeps({
        tutorRepo: {
          ...makeDeps().tutorRepo,
          getByUserId: mock(async () => null),
        },
      });
      const service = createTutorService(deps as any);
      await expect(service.getMyProfile("u1")).rejects.toThrow(
        TutorProfileNotFoundError,
      );
    });

    test("getMyProfile returns profile when found", async () => {
      const deps = makeDeps();
      const service = createTutorService(deps as any);
      const result = await service.getMyProfile("u1");
      expect(result.id).toBe("tp1");
    });

    test("updateMyProfile returns updated profile", async () => {
      const deps = makeDeps();
      const service = createTutorService(deps as any);
      const result = await service.updateMyProfile("u1", {
        displayName: "New Name",
        version: 1,
      });
      expect(result.id).toBe("tp1");
    });

    test("updateMyProfile throws OptimisticLockError on version mismatch", async () => {
      const deps = makeDeps({
        tutorRepo: {
          ...makeDeps().tutorRepo,
          updateProfileWithVersion: mock(async () => []),
        },
      });
      const service = createTutorService(deps as any);
      await expect(
        service.updateMyProfile("u1", { displayName: "New", version: 5 }),
      ).rejects.toThrow(OptimisticLockError);
    });

    test("published profile stores changed subject ids as pending edits", async () => {
      const profile = makeProfile({
        onboardingStatus: "published",
        subjects: [
          {
            subjectId: "child-1",
            subject: makeProfile().subjects[0].subject,
          },
        ],
      });
      const updateProfileWithVersion = mock(async () => [profile]);
      const deps = makeDeps({
        tutorRepo: {
          ...makeDeps().tutorRepo,
          getByUserId: mock(async () => profile),
          listActiveChildSubjects: mock(async () => [{ id: "child-2" }]),
          updateProfileWithVersion,
        },
      });
      const service = createTutorService(deps as any);

      await service.updateMyProfile("u1", {
        version: 1,
        subjectIds: ["child-2"],
      });

      expect(updateProfileWithVersion).toHaveBeenCalledWith(
        deps.db,
        "u1",
        1,
        expect.objectContaining({
          pendingProfileChanges: { subjectIds: ["child-2"] },
          profileEditStatus: "pending_review",
        }),
      );
    });

    test("published profile stores structured achievements as pending edits", async () => {
      const profile = makeProfile({
        onboardingStatus: "published",
        education: [],
        competitionAchievements: [],
      });
      const updateProfileWithVersion = mock(async () => [profile]);
      const deps = makeDeps({
        tutorRepo: {
          ...makeDeps().tutorRepo,
          getByUserId: mock(async () => profile),
          updateProfileWithVersion,
        },
      });
      const service = createTutorService(deps as any);
      const education = [{ university: "University", degree: "Degree" }];
      const competitionAchievements = [
        { competitionName: "Competition", year: 2020, awards: ["Champion"] },
      ];

      await service.updateMyProfile("u1", {
        version: 1,
        education,
        competitionAchievements,
      });

      expect(updateProfileWithVersion).toHaveBeenCalledWith(
        deps.db,
        "u1",
        1,
        expect.objectContaining({
          pendingProfileChanges: { education, competitionAchievements },
          profileEditStatus: "pending_review",
        }),
      );
      const updateArgs = updateProfileWithVersion.mock.calls[0][3] as Record<
        string,
        unknown
      >;
      expect(updateArgs.education).toBeUndefined();
      expect(updateArgs.competitionAchievements).toBeUndefined();
    });

    test("published profile applies a changed IDR base honorarium immediately", async () => {
      const profile = makeProfile({
        onboardingStatus: "published",
        baseRatesIdr: { online: 175_000 },
        pendingProfileChanges: null,
      });
      const updateProfileWithVersion = mock(async () => [profile]);
      const deps = makeDeps({
        tutorRepo: {
          ...makeDeps().tutorRepo,
          getByUserId: mock(async () => profile),
          updateProfileWithVersion,
        },
        pricingPort: idrPricingPort,
      });
      const service = createTutorService(deps as any);

      await service.updateMyProfile("u1", {
        version: 1,
        baseRatesIdr: { online: 200_000 },
      });

      expect(updateProfileWithVersion).toHaveBeenCalledWith(deps.db, "u1", 1, {
        baseRatesIdr: { online: 200_000 },
      });
    });

    test("published profile clears a legacy pending honorarium proposal", async () => {
      const profile = makeProfile({
        onboardingStatus: "published",
        baseRatesIdr: { online: 175_000 },
        pendingProfileChanges: {
          baseRatesIdr: { online: 190_000 },
        },
        profileEditStatus: "pending_review",
      });
      const updateProfileWithVersion = mock(async () => [profile]);
      const deps = makeDeps({
        tutorRepo: {
          ...makeDeps().tutorRepo,
          getByUserId: mock(async () => profile),
          updateProfileWithVersion,
        },
      });
      const service = createTutorService(deps as any);

      await service.updateMyProfile("u1", { version: 1 });

      expect(updateProfileWithVersion).toHaveBeenCalledWith(deps.db, "u1", 1, {
        baseRatesIdr: { online: 190_000 },
        pendingProfileChanges: null,
        profileEditStatus: "none",
        profileEditAdminNote: null,
      });
    });

    test("published profile removes an unchanged subject edit", async () => {
      const profile = makeProfile({
        onboardingStatus: "published",
        subjects: [
          {
            subjectId: "child-1",
            subject: makeProfile().subjects[0].subject,
          },
        ],
      });
      const updateProfileWithVersion = mock(async () => [profile]);
      const deps = makeDeps({
        tutorRepo: {
          ...makeDeps().tutorRepo,
          getByUserId: mock(async () => profile),
          listActiveChildSubjects: mock(async () => [{ id: "child-1" }]),
          updateProfileWithVersion,
        },
      });
      const service = createTutorService(deps as any);

      await service.updateMyProfile("u1", {
        version: 1,
        subjectIds: ["child-1"],
      });

      expect(updateProfileWithVersion).toHaveBeenCalledTimes(1);
    });

    test("submitForReview throws TutorProfileNotFoundError for null profile", async () => {
      const deps = makeDeps({
        tutorRepo: {
          ...makeDeps().tutorRepo,
          getByUserId: mock(async () => null),
        },
      });
      const service = createTutorService(deps as any);
      await expect(service.submitForReview("u1")).rejects.toThrow(
        TutorProfileNotFoundError,
      );
    });

    test("submitForReview returns updated profile", async () => {
      const deps = makeDeps();
      const service = createTutorService(deps as any);
      const result = await service.submitForReview("u1");
      expect(result.id).toBe("tp1");
    });

    test("listAvailability returns slots", async () => {
      const slots = [{ id: "s1", startDate: new Date(), endDate: new Date() }];
      const deps = makeDeps({
        tutorRepo: {
          ...makeDeps().tutorRepo,
          listAvailability: mock(async () => slots),
        },
      });
      const service = createTutorService(deps as any);
      const result = await service.listAvailability("u1");
      expect(result).toEqual(slots);
    });

    test("upsertAvailability throws AvailabilitySlotOverlapError on overlap", async () => {
      const existing = [
        {
          id: "existing1",
          startDate: new Date("2026-01-01T10:00:00Z"),
          endDate: new Date("2026-01-01T11:00:00Z"),
        },
      ];
      const deps = makeDeps({
        tutorRepo: {
          ...makeDeps().tutorRepo,
          listAvailability: mock(async () => existing),
        },
      });
      const service = createTutorService(deps as any);
      await expect(
        service.upsertAvailability("u1", {
          startDate: new Date("2026-01-01T10:30:00Z"),
          endDate: new Date("2026-01-01T11:30:00Z"),
          modality: "online",
        }),
      ).rejects.toThrow(AvailabilitySlotOverlapError);
    });

    test("upsertAvailability succeeds when no overlap", async () => {
      const existing = [
        {
          id: "existing1",
          startDate: new Date("2026-01-01T08:00:00Z"),
          endDate: new Date("2026-01-01T09:00:00Z"),
        },
      ];
      const deps = makeDeps({
        tutorRepo: {
          ...makeDeps().tutorRepo,
          listAvailability: mock(async () => existing),
        },
      });
      const service = createTutorService(deps as any);
      const result = await service.upsertAvailability("u1", {
        startDate: new Date("2026-01-01T10:00:00Z"),
        endDate: new Date("2026-01-01T11:00:00Z"),
        modality: "online",
      });
      expect(result.id).toBe("slot1");
    });

    test("createWeeklyAvailability creates one concrete slot per week", async () => {
      const day = 24 * 60 * 60 * 1000;
      const startDate = new Date(Date.now() + 2 * day);
      const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
      const repeatUntil = new Date(startDate.getTime() + 21 * day);
      const upsertAvailability = mock(
        async (
          _db: unknown,
          _userId: string,
          input: Record<string, unknown>,
        ) => ({ id: `slot-${String(input.startDate)}`, ...input }),
      );
      const deps = makeDeps({
        tutorRepo: {
          ...makeDeps().tutorRepo,
          listAvailability: mock(async () => []),
          upsertAvailability,
        },
      });
      const service = createTutorService(deps as any);

      const result = await service.createWeeklyAvailability("u1", {
        startDate,
        endDate,
        repeatUntil,
        modality: "online",
      });

      expect(result).toHaveLength(4);
      expect(upsertAvailability).toHaveBeenCalledTimes(4);
      expect(upsertAvailability.mock.calls[0]?.[2]).toMatchObject({
        modality: "online",
        isRecurring: true,
        recurrenceRule: "weekly",
        isActive: true,
      });
      expect(
        new Date(result[1].startDate).getTime() -
          new Date(result[0].startDate).getTime(),
      ).toBe(7 * day);
    });

    test("createWeeklyAvailability rejects the whole schedule on overlap", async () => {
      const day = 24 * 60 * 60 * 1000;
      const startDate = new Date(Date.now() + 2 * day);
      const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
      const repeatUntil = new Date(startDate.getTime() + 21 * day);
      const upsertAvailability = mock(async () => ({ id: "slot1" }));
      const deps = makeDeps({
        tutorRepo: {
          ...makeDeps().tutorRepo,
          listAvailability: mock(async () => [
            {
              id: "existing",
              startDate: new Date(startDate.getTime() + 7 * day),
              endDate: new Date(startDate.getTime() + 8 * day),
            },
          ]),
          upsertAvailability,
        },
      });
      const service = createTutorService(deps as any);

      await expect(
        service.createWeeklyAvailability("u1", {
          startDate,
          endDate,
          repeatUntil,
          modality: "online",
        }),
      ).rejects.toThrow(AvailabilitySlotOverlapError);
      expect(upsertAvailability).not.toHaveBeenCalled();
    });

    test("createWeeklyAvailability rejects an empty occurrence range", async () => {
      const deps = makeDeps();
      const service = createTutorService(deps as any);
      await expect(
        service.createWeeklyAvailability("u1", {
          startDate: new Date("2026-09-10T10:00:00Z"),
          endDate: new Date("2026-09-10T11:00:00Z"),
          repeatUntil: new Date("2026-09-01T10:00:00Z"),
          modality: "online",
        }),
      ).rejects.toThrow("Weekly availability can be scheduled");
    });

    test("replaceWeeklyAvailability atomically replaces recurring windows and preserves overrides", async () => {
      const deactivateFutureRecurringAvailability = mock(async () => {});
      const upsertAvailability = mock(
        async (
          _db: unknown,
          _userId: string,
          input: Record<string, unknown>,
        ) => ({
          id: `slot-${String(input.startDate)}`,
          ...input,
        }),
      );
      const deps = makeDeps({
        tutorRepo: {
          ...makeDeps().tutorRepo,
          deactivateFutureRecurringAvailability,
          listAvailability: mock(async () => []),
          upsertAvailability,
        },
      });
      const service = createTutorService(deps as any);
      const effectiveFrom = new Date("2026-08-17T00:00:00+07:00");
      const repeatUntil = new Date("2026-08-24T23:59:59+07:00");

      const result = await service.replaceWeeklyAvailability("u1", {
        effectiveFrom,
        repeatUntil,
        ranges: [
          {
            dayOfWeek: 1,
            startTime: "09:00",
            endTime: "17:00",
            modality: "online",
          },
        ],
      });

      expect(result).toHaveLength(2);
      expect(deactivateFutureRecurringAvailability).toHaveBeenCalledWith(
        expect.anything(),
        "u1",
        effectiveFrom,
      );
      expect(upsertAvailability).toHaveBeenCalledTimes(2);
    });

    test("one-off override deactivates a conflicting recurring occurrence", async () => {
      const deleteAvailability = mock(async () => {});
      const deps = makeDeps({
        tutorRepo: {
          ...makeDeps().tutorRepo,
          deleteAvailability,
          listAvailability: mock(async () => [
            {
              id: "weekly-occurrence",
              startDate: new Date("2026-09-01T02:00:00Z"),
              endDate: new Date("2026-09-01T10:00:00Z"),
              isRecurring: true,
            },
          ]),
        },
      });
      const service = createTutorService(deps as any);

      await service.upsertAvailability("u1", {
        startDate: new Date("2026-09-01T06:00:00Z"),
        endDate: new Date("2026-09-01T09:00:00Z"),
        modality: "offline",
        isRecurring: false,
      });

      expect(deleteAvailability).toHaveBeenCalledWith(
        expect.anything(),
        "weekly-occurrence",
      );
    });

    test("upsertAvailability allows updating own slot (same id)", async () => {
      const existing = [
        {
          id: "slot1",
          startDate: new Date("2026-01-01T10:00:00Z"),
          endDate: new Date("2026-01-01T11:00:00Z"),
        },
      ];
      const deps = makeDeps({
        tutorRepo: {
          ...makeDeps().tutorRepo,
          listAvailability: mock(async () => existing),
        },
      });
      const service = createTutorService(deps as any);
      const result = await service.upsertAvailability("u1", {
        id: "slot1",
        startDate: new Date("2026-01-01T10:00:00Z"),
        endDate: new Date("2026-01-01T11:30:00Z"),
        modality: "online",
      });
      expect(result.id).toBe("slot1");
    });

    test("upsertAvailability rejects updating another tutor's slot (H1)", async () => {
      const deps = makeDeps({
        tutorRepo: {
          ...makeDeps().tutorRepo,
          listAvailability: mock(async () => []),
          upsertAvailability: mock(async () => undefined),
        },
      });
      const service = createTutorService(deps as any);
      await expect(
        service.upsertAvailability("u1", {
          id: "foreign-slot",
          startDate: new Date("2026-01-01T10:00:00Z"),
          endDate: new Date("2026-01-01T11:00:00Z"),
          modality: "online",
        }),
      ).rejects.toThrow(TutorProfileNotFoundError);
    });

    test("replaceWeeklyAvailability skips occurrences covered by one-off overrides", async () => {
      const upsertAvailability = mock(async () => ({ id: "slot1" }));
      const deps = makeDeps({
        tutorRepo: {
          ...makeDeps().tutorRepo,
          listAvailability: mock(async () => [
            {
              id: "override",
              isRecurring: false,
              startDate: new Date("2026-08-17T02:00:00Z"),
              endDate: new Date("2026-08-17T03:00:00Z"),
            },
          ]),
          upsertAvailability,
        },
      });
      const service = createTutorService(deps as any);

      const result = await service.replaceWeeklyAvailability("u1", {
        effectiveFrom: new Date("2026-08-17T00:00:00+07:00"),
        repeatUntil: new Date("2026-08-17T23:59:59+07:00"),
        ranges: [
          {
            dayOfWeek: 1,
            startTime: "09:00",
            endTime: "10:00",
            modality: "online",
          },
        ],
      });

      expect(result).toEqual([]);
      expect(upsertAvailability).not.toHaveBeenCalled();
    });

    test("replaceWeeklyAvailability rejects overlapping weekly ranges", async () => {
      const service = createTutorService(makeDeps() as any);
      await expect(
        service.replaceWeeklyAvailability("u1", {
          effectiveFrom: new Date("2026-08-17T00:00:00+07:00"),
          repeatUntil: new Date("2026-08-17T23:59:59+07:00"),
          ranges: [
            {
              dayOfWeek: 1,
              startTime: "09:00",
              endTime: "11:00",
              modality: "online",
            },
            {
              dayOfWeek: 1,
              startTime: "10:00",
              endTime: "12:00",
              modality: "online",
            },
          ],
        }),
      ).rejects.toThrow(AvailabilitySlotOverlapError);
    });

    test("getMyPayouts rejects invalid date filters", async () => {
      const service = createTutorService(makeDeps() as any);
      await expect(
        service.getMyPayouts("u1", { dateFrom: "not-a-date" }),
      ).rejects.toThrow(InvalidDateRangeError);
      await expect(
        service.getMyPayouts("u1", { dateTo: "not-a-date" }),
      ).rejects.toThrow(InvalidDateRangeError);
    });

    test("getMyPayouts uses pending totals by default and dated totals for filters", async () => {
      const payout = {
        getPendingTutorPayouts: mock(async () => ({ completedSessions: 2 })),
        getTutorPayouts: mock(async () => ({ completedSessions: 1 })),
      };
      const service = createTutorService(makeDeps({ payout }) as any);
      await expect(service.getMyPayouts("u1", {})).resolves.toEqual({
        completedSessions: 2,
      });
      await expect(
        service.getMyPayouts("u1", {
          dateFrom: "2026-08-01T00:00:00Z",
          dateTo: "2026-08-31T00:00:00Z",
        }),
      ).resolves.toEqual({ completedSessions: 1 });
      expect(payout.getTutorPayouts).toHaveBeenCalledWith(
        expect.objectContaining({
          tutorId: "u1",
          dateFrom: expect.any(Date),
          dateTo: expect.any(Date),
        }),
      );
    });

    test("deleteAvailability throws TutorProfileNotFoundError when slot not found", async () => {
      const deps = makeDeps({
        tutorRepo: {
          ...makeDeps().tutorRepo,
          listAvailability: mock(async () => []),
        },
      });
      const service = createTutorService(deps as any);
      await expect(
        service.deleteAvailability("u1", "nonexistent"),
      ).rejects.toThrow(TutorProfileNotFoundError);
    });

    test("deleteAvailability succeeds when slot exists", async () => {
      const existing = [
        {
          id: "slot1",
          startDate: new Date(),
          endDate: new Date(),
        },
      ];
      const deps = makeDeps({
        tutorRepo: {
          ...makeDeps().tutorRepo,
          listAvailability: mock(async () => existing),
        },
      });
      const service = createTutorService(deps as any);
      await service.deleteAvailability("u1", "slot1");
      expect(deps.tutorRepo.deleteAvailability).toHaveBeenCalledWith(
        deps.db,
        "slot1",
      );
    });
  });
});
