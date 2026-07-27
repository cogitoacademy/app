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
  computeSplit: (total: number, size: number) => ({
    perStudent: Math.floor(total / size),
    baseline: total,
    tutorShare: Math.floor(total * 0.8),
    cogitoTake: Math.floor(total * 0.2),
  }),
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

    test("does not throw when input provides modality override with prices", () => {
      expect(() =>
        validateUpdateInput(
          makeProfile({ onboardingStatus: "draft", modality: "online" }),
          { prices: { "1": 50 }, modality: "both" },
          {
            ...mockPricingPort,
            validatePrices: () => null,
          },
        ),
      ).not.toThrow();
    });

    test("throws when modality override prices fail validation", () => {
      expect(() =>
        validateUpdateInput(
          makeProfile({ onboardingStatus: "draft", modality: "online" }),
          { prices: { "1": 0 }, modality: "both" },
          failPricingPort,
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

    test("does not throw for changes_requested profile", () => {
      expect(() =>
        validateSubmitForReview(
          makeProfile({ onboardingStatus: "changes_requested" }),
          mockPricingPort,
        ),
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

    test("throws InvalidTutorPricingError when pricing validation fails", () => {
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
      ).rejects.toThrow();
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
  });
});
