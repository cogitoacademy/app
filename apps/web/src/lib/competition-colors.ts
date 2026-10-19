import type { CSSProperties } from "react";

export type CompetitionPalette = {
  lightTextColor: string;
  lightBackgroundColor: string;
  darkTextColor: string;
  darkBackgroundColor: string;
};

type CompetitionPaletteProjection = {
  [Key in keyof CompetitionPalette]?: string | null;
};

export function getCompetitionPalette(
  value?: CompetitionPaletteProjection | null,
): CompetitionPalette | null {
  if (
    typeof value?.lightTextColor !== "string" ||
    typeof value.lightBackgroundColor !== "string" ||
    typeof value.darkTextColor !== "string" ||
    typeof value.darkBackgroundColor !== "string"
  ) {
    return null;
  }
  return {
    lightTextColor: value.lightTextColor,
    lightBackgroundColor: value.lightBackgroundColor,
    darkTextColor: value.darkTextColor,
    darkBackgroundColor: value.darkBackgroundColor,
  };
}

export const competitionPaletteClassName =
  "bg-[color:var(--competition-light-background)] text-[color:var(--competition-light-text)] dark:bg-[color:var(--competition-dark-background)] dark:text-[color:var(--competition-dark-text)]";

export function getCompetitionPaletteStyle(
  palette?: CompetitionPalette | null,
): CSSProperties | undefined {
  if (!palette) return undefined;
  return {
    "--competition-light-text": palette.lightTextColor,
    "--competition-light-background": palette.lightBackgroundColor,
    "--competition-dark-text": palette.darkTextColor,
    "--competition-dark-background": palette.darkBackgroundColor,
  } as CSSProperties;
}
