import { describe, test, expect } from "bun:test";
import {
  validateUpdateInput,
  validateSubmitForReview,
} from "../../modules/tutor/tutor.service";
import type { PricingPort } from "../../modules/pricing/pricing.service";

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
    test("returns ok for draft profile with valid input", () => {
      const result = validateUpdateInput(
        makeProfile({ onboardingStatus: "draft" }),
        { displayName: "New Name" },
        mockPricingPort,
      );
      expect(result.ok).toBe(true);
    });

    test("returns ok for changes_requested profile", () => {
      const result = validateUpdateInput(
        makeProfile({ onboardingStatus: "changes_requested" }),
        { displayName: "Updated" },
        mockPricingPort,
      );
      expect(result.ok).toBe(true);
    });

    test("returns error for null profile", () => {
      const result = validateUpdateInput(
        null,
        { displayName: "X" },
        mockPricingPort,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
    });

    test("returns error for published profile", () => {
      const result = validateUpdateInput(
        makeProfile({ onboardingStatus: "published" }),
        { displayName: "X" },
        mockPricingPort,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("FORBIDDEN");
    });

    test("returns error when pricing validation fails", () => {
      const result = validateUpdateInput(
        makeProfile({ onboardingStatus: "draft" }),
        { prices: { "1": 0 } },
        failPricingPort,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("BAD_REQUEST");
    });

    test("returns ok when input has no prices (skip pricing validation)", () => {
      const result = validateUpdateInput(
        makeProfile({ onboardingStatus: "draft" }),
        { displayName: "New Name" },
        failPricingPort,
      );
      expect(result.ok).toBe(true);
    });

    test("returns ok when input provides modality override with prices", () => {
      const result = validateUpdateInput(
        makeProfile({ onboardingStatus: "draft", modality: "online" }),
        { prices: { "1": 50 }, modality: "both" },
        {
          ...mockPricingPort,
          validatePrices: () => null,
        },
      );
      expect(result.ok).toBe(true);
    });

    test("returns error when modality override prices fail validation", () => {
      const result = validateUpdateInput(
        makeProfile({ onboardingStatus: "draft", modality: "online" }),
        { prices: { "1": 0 }, modality: "both" },
        failPricingPort,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("BAD_REQUEST");
    });
  });

  describe("validateSubmitForReview", () => {
    test("returns ok for complete draft profile", () => {
      const result = validateSubmitForReview(makeProfile(), mockPricingPort);
      expect(result.ok).toBe(true);
    });

    test("returns ok for changes_requested profile", () => {
      const result = validateSubmitForReview(
        makeProfile({ onboardingStatus: "changes_requested" }),
        mockPricingPort,
      );
      expect(result.ok).toBe(true);
    });

    test("returns error for null profile", () => {
      const result = validateSubmitForReview(null, mockPricingPort);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
    });

    test("returns error for invalid status", () => {
      const result = validateSubmitForReview(
        makeProfile({ onboardingStatus: "pending_review" }),
        mockPricingPort,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("BAD_REQUEST");
    });

    test("returns error for missing required fields", () => {
      const result = validateSubmitForReview(
        makeProfile({ displayName: null }),
        mockPricingPort,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.message).toContain("required");
    });

    test("returns error for empty expertise", () => {
      const result = validateSubmitForReview(
        makeProfile({ expertise: [] }),
        mockPricingPort,
      );
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.message).toContain("expertise");
    });

    test("returns error when pricing validation fails", () => {
      const result = validateSubmitForReview(makeProfile(), failPricingPort);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("BAD_REQUEST");
    });
  });
});
