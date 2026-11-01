export const MAX_FEEDBACK_CHARACTERS = 600;
export const FEEDBACK_LENGTH_ERROR =
  "Each feedback field must contain at most 600 characters in total, including line breaks";

/** Preserve draft spacing/empty lines so typing never silently discards content. */
export function parseFeedbackLines(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/^\s*•\s?/, ""));
}

export function normalizeFeedbackBullets(bullets: string[]): string[] {
  return bullets
    .flatMap(parseFeedbackLines)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function countFeedbackCharacters(bullets: string[]): number {
  return Array.from(normalizeFeedbackBullets(bullets).join("\n")).length;
}
