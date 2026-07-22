import { describe, test, expect } from "bun:test";
import {
  validateUpdateInput,
  validateSubmitForReview,
} from "../../modules/tutor/tutor.service";
import type { PricingPort } from "../../modules/pricing/pricing.service";
import {
  TutorProfileNotFoundError,
  TutorProfileNotEditableError,
  InvalidTutorStatusError,
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

    test("throws when pricing validation fails", () => {
      expect(() =>
        validateUpdateInput(
          makeProfile({ onboardingStatus: "draft" }),
          { prices: { "1": 0 } },
          failPricingPort,
        ),
      ).toThrow();
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
      ).toThrow();
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

    test("throws for missing required fields", () => {
      expect(() =>
        validateSubmitForReview(
          makeProfile({ displayName: null }),
          mockPricingPort,
        ),
      ).toThrow();
    });

    test("throws for empty expertise", () => {
      expect(() =>
        validateSubmitForReview(
          makeProfile({ expertise: [] }),
          mockPricingPort,
        ),
      ).toThrow();
    });

    test("throws when pricing validation fails", () => {
      expect(() =>
        validateSubmitForReview(makeProfile(), failPricingPort),
      ).toThrow();
    });
  });
});
