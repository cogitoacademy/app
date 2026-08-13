import { describe, test, expect, mock } from "bun:test";
import {
  validateUpdateInput,
  validateSubmitForReview,
  createTutorService,
} from "../../modules/tutor/tutor.service";
import type { PricingPort } from "../../modules/pricing/pricing.service";
import {
  TutorProfileNotFoundError,
  TutorProfileNotEditableError,
  InvalidTutorStatusError,
  TutorProfileIncompleteError,
  InvalidTutorPricingError,
  AvailabilitySlotOverlapError,
  OptimisticLockError,
} from "../../modules/tutor/tutor.errors";

function makeProfile(overrides: Record<string, unknown> = {}) {
  return {
    id: "tp1",
    displayName: "Dr. Smith",
    shortBio: "Experienced tutor",
    credentialsSummary: "PhD in Math",
    modality: "online",
    prices: { "1": 50 },
    expertise: ["math"],
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

    test("throws TutorProfileNotEditableError for published profile", () => {
      expect(() =>
        validateUpdateInput(
          makeProfile({ onboardingStatus: "published" }),
          { displayName: "X" },
          mockPricingPort,
        ),
      ).toThrow(TutorProfileNotEditableError);
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

    test("throws TutorProfileIncompleteError for empty expertise", () => {
      expect(() =>
        validateSubmitForReview(
          makeProfile({ expertise: [] }),
          mockPricingPort,
        ),
      ).toThrow(TutorProfileIncompleteError);
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
        },
        pricingPort: mockPricingPort,
        auditPort: { record: mock(async () => {}) },
        db: {
          transaction: mock(async (fn: any) => {
            const tx = {};
            return fn(tx);
          }),
        },
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
