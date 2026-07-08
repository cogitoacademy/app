import { describe, test, expect } from "bun:test";
import {
  createPricingService,
  ONLINE_FLOOR_PRICES,
  OFFLINE_FLOOR_PRICES,
} from "../../modules/pricing/pricing.service";

describe("Pricing Service", () => {
  const pricing = createPricingService();

  describe("validatePrices", () => {
    test("returns null for valid online prices", () => {
      const result = pricing.validatePrices({ "1": 50, "2": 40 }, "online");
      expect(result).toBeNull();
    });

    test("returns null for valid offline prices", () => {
      const result = pricing.validatePrices({ "1": 60, "2": 50 }, "offline");
      expect(result).toBeNull();
    });

    test("returns null for valid both-modality prices (takes max floor)", () => {
      const result = pricing.validatePrices({ "1": 55, "2": 50 }, "both");
      expect(result).toBeNull();
    });

    test("returns error for empty prices", () => {
      const result = pricing.validatePrices({}, "online");
      expect(result).toBe("Prices are required");
    });

    test("returns error for null prices", () => {
      const result = pricing.validatePrices(null as any, "online");
      expect(result).toBe("Prices are required");
    });

    test("returns error for price below online floor", () => {
      const result = pricing.validatePrices({ "1": 30 }, "online");
      expect(result).toContain("floor price");
    });

    test("returns error for price below offline floor", () => {
      const result = pricing.validatePrices({ "1": 40 }, "offline");
      expect(result).toContain("floor price");
    });

    test("returns error for invalid group size", () => {
      const result = pricing.validatePrices({ "7": 100 }, "online");
      expect(result).toContain("Invalid group size");
    });

    test("returns error for negative price", () => {
      const result = pricing.validatePrices({ "1": -5 }, "online");
      expect(result).toContain("Invalid price");
    });

    test("returns error for zero group size", () => {
      const result = pricing.validatePrices({ "0": 50 }, "online");
      expect(result).toContain("Invalid group size");
    });
  });

  describe("computeSplit", () => {
    test("splits 50 marks for solo (1 student)", () => {
      const result = pricing.computeSplit(50, 1);
      expect(result.perStudent).toBe(50);
      expect(result.baseline).toBe(50);
      expect(result.cogitoTake).toBe(10);
      expect(result.tutorShare).toBe(40);
    });

    test("splits 100 marks for group of 2", () => {
      const result = pricing.computeSplit(100, 2);
      expect(result.perStudent).toBe(50);
      expect(result.baseline).toBe(100);
      expect(result.cogitoTake).toBe(20);
      expect(result.tutorShare).toBe(80);
    });

    test("cogito take is always 20%", () => {
      for (const size of [1, 2, 3, 4, 5, 6] as const) {
        const result = pricing.computeSplit(200, size);
        expect(result.cogitoTake).toBe(40);
        expect(result.tutorShare).toBe(160);
      }
    });
  });

  describe("floor price tables", () => {
    test("online floor prices have entries for sizes 1-6", () => {
      for (let i = 1; i <= 6; i++) {
        expect(ONLINE_FLOOR_PRICES[i]).toBeDefined();
        expect(ONLINE_FLOOR_PRICES[i]).toBeGreaterThan(0);
      }
    });

    test("offline floor prices have entries for sizes 1-6", () => {
      for (let i = 1; i <= 6; i++) {
        expect(OFFLINE_FLOOR_PRICES[i]).toBeDefined();
        expect(OFFLINE_FLOOR_PRICES[i]).toBeGreaterThan(0);
      }
    });

    test("offline floor prices are always >= online floor prices", () => {
      for (let i = 1; i <= 6; i++) {
        expect(OFFLINE_FLOOR_PRICES[i]).toBeGreaterThanOrEqual(
          ONLINE_FLOOR_PRICES[i],
        );
      }
    });
  });
});
