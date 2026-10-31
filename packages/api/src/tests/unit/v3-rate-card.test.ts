import { describe, expect, test } from "bun:test";
import {
  calculateV3SessionPrice,
  calculateV3TopUpPrice,
  type V3Competition,
} from "../../modules/pricing/v3-rate-card";

// Literal acceptance tables, independently reviewed against the scope formula.
const matrices = [
  {
    competitions: [
      "competition-model-united-nations",
      "competition-world-scholars-cup",
    ],
    online: [50, 31, 25, 22, 20, 19],
    offline: [72, 46, 38, 33, 31, 29],
    onlineFees: [200000, 230000, 260000, 290000, 320000, 350000],
    offlineFees: [275000, 325000, 375000, 425000, 475000, 525000],
  },
  {
    competitions: ["competition-debate", "competition-olympiad"],
    online: [44, 28, 23, 20, 19, 18],
    offline: [66, 43, 36, 32, 30, 28],
    onlineFees: [180000, 210000, 240000, 270000, 300000, 330000],
    offlineFees: [255000, 305000, 355000, 405000, 455000, 505000],
  },
  {
    competitions: [
      "competition-essay-writing",
      "competition-business",
      "competition-public-speaking",
    ],
    online: [38, 25, 21, 19, 18, 17],
    offline: [60, 40, 34, 30, 28, 27],
    onlineFees: [160000, 190000, 220000, 250000, 280000, 310000],
    offlineFees: [235000, 285000, 335000, 385000, 435000, 485000],
  },
] as const;

describe("V3 competition rate card", () => {
  for (const matrix of matrices) {
    for (const competition of matrix.competitions) {
      for (const modality of ["online", "offline"] as const) {
        for (let headcount = 1; headcount <= 6; headcount++) {
          test(`${competition} ${modality} ${headcount} students`, () => {
            const result = calculateV3SessionPrice({
              competition,
              modality,
              headcount,
            });
            const perStudent = matrix[modality][headcount - 1]!;
            expect(result.perStudentMarks).toBe(perStudent);
            expect(result.tutorFeeIdr).toBe(
              matrix[`${modality}Fees`][headcount - 1]!,
            );
            expect(result.collectedMarks).toBe(perStudent * headcount);
            expect(result.collectedMarks).toBeGreaterThanOrEqual(
              result.totalMarks,
            );
            expect(result.collectedMarks - result.totalMarks).toBeLessThan(
              headcount,
            );
          });
        }
      }
    }
  }

  test("rejects invalid headcount, modality and taxonomy instead of silently quoting", () => {
    const input = {
      competition: "competition-debate",
      modality: "online",
      headcount: 1,
    } as const;
    for (const headcount of [0, -1, 1.5, 7, NaN, Infinity]) {
      expect(() => calculateV3SessionPrice({ ...input, headcount })).toThrow(
        RangeError,
      );
    }
    for (const competition of [
      "unknown",
      "toString",
      "competition-wsc-debate",
    ]) {
      expect(() =>
        calculateV3SessionPrice({
          ...input,
          competition: competition as V3Competition,
        }),
      ).toThrow(RangeError);
    }
    expect(() =>
      calculateV3SessionPrice({ ...input, modality: "both" as "online" }),
    ).toThrow(RangeError);
  });
});

describe("V3 top-up defaults", () => {
  test.each([
    [1, 7250],
    [31, 224750],
    [49, 355250],
    [50, 350000],
    [51, 369750],
    [140, 1015000],
    [149, 1080250],
    [150, 975000],
    [151, 1019250],
    [176, 1188000],
    [249, 1680750],
    [250, 1500000],
    [251, 1568750],
    [320, 2000000],
    [499, 3118750],
    [500, 2750000],
    [501, 2880750],
    [600, 3450000],
  ])("%i Marks costs %i IDR", (marks, amountIdr) => {
    expect(calculateV3TopUpPrice(marks)).toMatchObject({ marks, amountIdr });
  });

  test("recommends next package without replacing requested amount", () => {
    expect(calculateV3TopUpPrice(140)).toEqual({
      marks: 140,
      amountIdr: 1015000,
      packageCode: null,
      recommendation: { code: "learner", marks: 150, priceIdr: 975000 },
    });
    expect(calculateV3TopUpPrice(31).recommendation).toBeNull();
    expect(calculateV3TopUpPrice(50).packageCode).toBe("starter");
    expect(calculateV3TopUpPrice(150).recommendation).toBeNull();
    expect(calculateV3TopUpPrice(600).recommendation).toBeNull();
  });

  test("each call returns independent recommendation data", () => {
    const first = calculateV3TopUpPrice(140);
    if (first.recommendation)
      Object.assign(first.recommendation, { priceIdr: 1 });
    expect(calculateV3TopUpPrice(140).recommendation?.priceIdr).toBe(975000);
  });

  test("recommends at equality, but not just below the next package price", () => {
    expect(calculateV3TopUpPrice(439).recommendation).toBeNull();
    expect(calculateV3TopUpPrice(440)).toMatchObject({
      marks: 440,
      amountIdr: 2750000,
      recommendation: { code: "pioneer", marks: 500, priceIdr: 2750000 },
    });
    expect(calculateV3TopUpPrice(441).recommendation?.code).toBe("pioneer");
  });

  test("rejects unsafe arithmetic and invalid Marks", () => {
    for (const marks of [
      0,
      -1,
      0.5,
      NaN,
      Infinity,
      Number.MAX_SAFE_INTEGER,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      expect(() => calculateV3TopUpPrice(marks)).toThrow(RangeError);
    }
  });
});
