import { describe, expect, test } from "bun:test";

import {
  competitionPaletteClassName,
  competitionPaletteSubtleClassName,
  getCompetitionPalette,
  getCompetitionPaletteStyle,
} from "./competition-colors";

describe("competition palette presentation", () => {
  const palette = {
    lightTextColor: "oklch(0.2 0.02 250)",
    lightBackgroundColor: "oklch(0.96 0.03 250)",
    darkTextColor: "oklch(0.92 0.02 250)",
    darkBackgroundColor: "oklch(0.25 0.04 250)",
  };

  test("accepts complete palettes without normalizing stored precision", () => {
    expect(getCompetitionPalette(palette)).toEqual(palette);
  });

  test("rejects incomplete palette projections", () => {
    expect(
      getCompetitionPalette({ lightTextColor: palette.lightTextColor }),
    ).toBe(null);
  });

  test("applies opaque catalog colors through light and dark variables", () => {
    expect(competitionPaletteClassName).toContain(
      "bg-[color:var(--competition-light-background)]",
    );
    expect(competitionPaletteClassName).toContain(
      "dark:text-[color:var(--competition-dark-text)]",
    );
    const style = getCompetitionPaletteStyle(palette) as unknown as Record<
      string,
      string
    >;
    expect(style).toEqual({
      "--competition-light-text": palette.lightTextColor,
      "--competition-light-background": palette.lightBackgroundColor,
      "--competition-dark-text": palette.darkTextColor,
      "--competition-dark-background": palette.darkBackgroundColor,
    });
  });

  test("keeps calendar event colors subtle without flattening dynamic palettes", () => {
    expect(competitionPaletteSubtleClassName).toContain(
      "color-mix(in_oklab,var(--competition-light-background)_15%,transparent)",
    );
    expect(competitionPaletteSubtleClassName).toContain(
      "color-mix(in_oklab,var(--competition-light-background)_25%,transparent)",
    );
    expect(competitionPaletteSubtleClassName).toContain(
      "dark:border-[color:var(--competition-dark-background)]",
    );
  });

  test("leaves missing palette styling to a neutral caller fallback", () => {
    expect(getCompetitionPaletteStyle(null)).toBeUndefined();
  });
});
