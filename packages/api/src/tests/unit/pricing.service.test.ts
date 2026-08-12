import { describe, test, expect } from "bun:test";
import { createPricingService } from "../../modules/pricing/pricing.service";
import {
  ONLINE_FLOOR_PRICES,
  OFFLINE_FLOOR_PRICES,
} from "../../shared/constants";

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

  describe("computeSplit (extra-take rule)", () => {
    test("online class for 1 at floor (42) → tutor 30, Cogito 12", () => {
      const r = pricing.computeSplit("online", 42, 1);
      expect(r.tutorShare).toBe(30);
      expect(r.cogitoTake).toBe(12);
      expect(r.extraTotal).toBe(0);
      expect(r.cogitoExtraTake).toBe(0);
    });

    test("online class for 1 at 50 → tutor 37, Cogito 13 (extra 8, Cogito extra 1)", () => {
      const r = pricing.computeSplit("online", 50, 1);
      expect(r.extraTotal).toBe(8);
      expect(r.cogitoExtraTake).toBe(1);
      expect(r.tutorExtraShare).toBe(7);
      expect(r.tutorShare).toBe(37);
      expect(r.cogitoTake).toBe(13);
    });

    test("online class for 3 at floor (28) → tutor 64, Cogito 20", () => {
      const r = pricing.computeSplit("online", 28, 3);
      expect(r.tutorShare).toBe(64);
      expect(r.cogitoTake).toBe(20);
    });

    test("online class for 3 at 32 → tutor 74, Cogito 22 (extra 12, Cogito extra 2)", () => {
      const r = pricing.computeSplit("online", 32, 3);
      expect(r.extraTotal).toBe(12);
      expect(r.cogitoExtraTake).toBe(2);
      expect(r.tutorShare).toBe(74);
      expect(r.cogitoTake).toBe(22);
    });

    test("offline class for 2 at floor (45) → tutor 70, Cogito 20", () => {
      const r = pricing.computeSplit("offline", 45, 2);
      expect(r.tutorShare).toBe(70);
      expect(r.cogitoTake).toBe(20);
    });

    test("extra total of 4 → Cogito extra 0, all to tutor", () => {
      const r = pricing.computeSplit("online", 46, 1); // baseline 42, extra 4
      expect(r.cogitoExtraTake).toBe(0);
      expect(r.tutorShare).toBe(34);
    });

    test("extra total of 5 → Cogito extra 1, 4 to tutor", () => {
      const r = pricing.computeSplit("online", 47, 1); // baseline 42, extra 5
      expect(r.cogitoExtraTake).toBe(1);
      expect(r.tutorShare).toBe(34);
    });

    test("perStudent is floored and baseline total is the floor total", () => {
      const r = pricing.computeSplit("online", 32.5, 3);
      expect(r.perStudent).toBe(32);
      expect(r.baseline).toBe(84);
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
