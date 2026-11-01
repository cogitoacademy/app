import type { CompetitionPalette } from "./competition-colors";

function linearizeSrgb(value: number) {
  const channel = Math.max(0, Math.min(1, value));
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(color: string): number | null {
  const match = color.match(
    /^oklch\(\s*(\d*\.?\d+)\s+(\d*\.?\d+)\s+(\d*\.?\d+)\s*\)$/i,
  );
  if (!match) return null;

  const [, lightnessText, chromaText, hueText] = match;
  const lightness = Number(lightnessText);
  const chroma = Number(chromaText);
  const hue = Number(hueText);
  if (
    lightness < 0 ||
    lightness > 1 ||
    chroma < 0 ||
    chroma > 0.5 ||
    hue < 0 ||
    hue > 360
  ) {
    return null;
  }

  const radians = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(radians);
  const b = chroma * Math.sin(radians);
  const lRoot = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const mRoot = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const sRoot = lightness - 0.0894841775 * a - 1.291485548 * b;
  const l = lRoot ** 3;
  const m = mRoot ** 3;
  const s = sRoot ** 3;
  const red = linearizeSrgb(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
  );
  const green = linearizeSrgb(
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
  );
  const blue = linearizeSrgb(
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function getPaletteContrastRatio(
  textColor: string,
  backgroundColor: string,
): number | null {
  const text = relativeLuminance(textColor);
  const background = relativeLuminance(backgroundColor);
  if (text === null || background === null) return null;
  const lighter = Math.max(text, background);
  const darker = Math.min(text, background);
  return (lighter + 0.05) / (darker + 0.05);
}

export function getPaletteContrastWarnings(palette: CompetitionPalette) {
  const warnings: Array<{ theme: "Light" | "Dark"; ratio: number }> = [];
  for (const [theme, text, background] of [
    ["Light", palette.lightTextColor, palette.lightBackgroundColor],
    ["Dark", palette.darkTextColor, palette.darkBackgroundColor],
  ] as const) {
    const ratio = getPaletteContrastRatio(text, background);
    if (ratio !== null && ratio < 4.5) warnings.push({ theme, ratio });
  }
  return warnings;
}
