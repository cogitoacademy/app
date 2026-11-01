import { describe, expect, test } from "bun:test";
import {
  DEFAULT_V3_ECONOMY_CONFIG,
  v3EconomyConfigSchema,
} from "../../modules/pricing/v3-economy.config";
import {
  calculateV3SessionPrice,
  calculateV3TopUpPrice,
} from "../../modules/pricing/v3-rate-card";
import { adminSaveV3EconomyInput } from "../../modules/admin/admin.types";

const defaults = () => structuredClone(DEFAULT_V3_ECONOMY_CONFIG);

describe("V3 editable economy validation", () => {
  test("default configuration validates and returns independent values", () => {
    const config = v3EconomyConfigSchema.parse(DEFAULT_V3_ECONOMY_CONFIG);
    config.packages[0]!.priceIdr = 1;
    expect(DEFAULT_V3_ECONOMY_CONFIG.packages[0]!.priceIdr).toBe(350000);
  });

  test("tier thresholds and package exceptions follow edited package Marks", () => {
    const config = defaults();
    config.packages = [
      { code: "starter", marks: 60, priceIdr: 420000 },
      { code: "learner", marks: 200, priceIdr: 1300000 },
      { code: "explorer", marks: 400, priceIdr: 2400000 },
      { code: "pioneer", marks: 800, priceIdr: 4400000 },
    ];
    expect(calculateV3TopUpPrice(176, config).amountIdr).toBe(1276000);
    expect(calculateV3TopUpPrice(200, config)).toMatchObject({
      amountIdr: 1300000,
      packageCode: "learner",
    });
    expect(calculateV3TopUpPrice(201, config).amountIdr).toBe(1356750);
    expect(calculateV3TopUpPrice(190, config).recommendation?.marks).toBe(200);
    expect(calculateV3TopUpPrice(50, config).packageCode).toBeNull();
    expect(calculateV3TopUpPrice(176).amountIdr).toBe(1188000);
  });

  test("fractional package unit price rounds upward once for the full custom purchase", () => {
    const config = defaults();
    config.packages = [{ code: "small", marks: 3, priceIdr: 10 }];
    expect(calculateV3TopUpPrice(2, config).amountIdr).toBe(507);
    expect(calculateV3TopUpPrice(3, config).amountIdr).toBe(10);
    config.exactSurchargeIdr = 0;
    expect(calculateV3TopUpPrice(4, config).amountIdr).toBe(14);
  });

  test("edited competition and modality adjustments affect only supplied config", () => {
    const config = defaults();
    config.competitionRates["competition-debate"] = {
      soloMarks: 60,
      soloFeeIdr: 250000,
    };
    config.onlineAdditionalMarks = 15;
    config.onlineAdditionalFeeIdr = 45000;
    const input = {
      competition: "competition-debate",
      modality: "online",
      headcount: 3,
    } as const;
    expect(calculateV3SessionPrice(input, config)).toMatchObject({
      perStudentMarks: 30,
      tutorFeeIdr: 340000,
    });
    expect(calculateV3SessionPrice(input)).toMatchObject({
      perStudentMarks: 23,
      tutorFeeIdr: 240000,
    });
  });

  test("accepts a catalog slug outside the seven defaults and prices from that rate", () => {
    const config = defaults();
    config.competitionRates["competition-policy-debate"] = {
      soloMarks: 41,
      soloFeeIdr: 123000,
    };
    expect(v3EconomyConfigSchema.safeParse(config).success).toBe(true);
    expect(
      calculateV3SessionPrice(
        {
          competition: "competition-policy-debate",
          modality: "online",
          headcount: 2,
        },
        config,
      ),
    ).toMatchObject({
      perStudentMarks: 27,
      tutorFeeIdr: 153000,
    });
  });

  for (const scenario of [
    "duplicate codes",
    "duplicate Marks",
    "unordered Marks",
    "increasing unit price",
    "decreasing package price",
    "negative surcharge",
    "fractional fee",
    "missing competition",
    "invalid competition slug",
    "fee overflow",
  ]) {
    test(`rejects ${scenario}`, () => {
      const config = defaults();
      switch (scenario) {
        case "duplicate codes":
          config.packages[1]!.code = config.packages[0]!.code;
          break;
        case "duplicate Marks":
          config.packages[1]!.marks = 50;
          break;
        case "unordered Marks":
          config.packages.reverse();
          break;
        case "increasing unit price":
          config.packages[1]!.priceIdr = 1100000;
          break;
        case "decreasing package price":
          config.packages[1]!.priceIdr = 100000;
          break;
        case "negative surcharge":
          config.exactSurchargeIdr = -1;
          break;
        case "fractional fee":
          config.onlineAdditionalFeeIdr = 0.5;
          break;
        case "missing competition":
          Reflect.deleteProperty(config.competitionRates, "competition-debate");
          break;
        case "invalid competition slug":
          Object.assign(config.competitionRates, {
            invalid_slug: { soloMarks: 10, soloFeeIdr: 10 },
          });
          break;
        case "fee overflow":
          config.competitionRates["competition-debate"]!.soloFeeIdr =
            2000000000;
          break;
      }
      expect(v3EconomyConfigSchema.safeParse(config).success).toBe(false);
    });
  }

  test("save requires a reason and nonnegative expected version", () => {
    const input = {
      expectedVersion: 0,
      reason: " Launch rates ",
      values: defaults(),
    };
    expect(adminSaveV3EconomyInput.parse(input).reason).toBe("Launch rates");
    expect(
      adminSaveV3EconomyInput.safeParse({ ...input, reason: " " }).success,
    ).toBe(false);
    expect(
      adminSaveV3EconomyInput.safeParse({ ...input, expectedVersion: -1 })
        .success,
    ).toBe(false);
  });
});
