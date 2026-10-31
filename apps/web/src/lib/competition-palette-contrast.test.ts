import { describe, expect, test } from "bun:test";

import {
  getPaletteContrastRatio,
  getPaletteContrastWarnings,
} from "./competition-palette-contrast";

describe("competition palette contrast", () => {
  test("calculates the contrast of opaque neutral OKLCH colors", () => {
    expect(getPaletteContrastRatio("oklch(0 0 0)", "oklch(1 0 0)")).toBeCloseTo(
      21,
      1,
    );
    expect(getPaletteContrastRatio("oklch(0.5 0 0)", "oklch(0.5 0 0")).toBe(
      null,
    );
  });

  test("reports low-contrast light and dark pairs without rejecting the palette", () => {
    expect(
      getPaletteContrastWarnings({
        lightTextColor: "oklch(0.5 0 0)",
        lightBackgroundColor: "oklch(0.5 0 0)",
        darkTextColor: "oklch(0 0 0)",
        darkBackgroundColor: "oklch(1 0 0)",
      }),
    ).toEqual([{ theme: "Light", ratio: 1 }]);
  });
});
