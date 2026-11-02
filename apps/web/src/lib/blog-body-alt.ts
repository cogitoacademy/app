import type { BlogBlock } from "@cogito-app/api/modules/blog/blog.types";

/** Returns 1-based positions of body images whose alt text is empty. */
export function missingBodyImageAlts(body: BlogBlock[]): number[] {
  const missing: number[] = [];
  let imageNumber = 0;
  for (const block of body) {
    if (block.type !== "image") continue;
    imageNumber += 1;
    if (!block.alt.trim()) missing.push(imageNumber);
  }
  return missing;
}

/**
 * The API requires alt text on every body image. Check before saving so the
 * editor reports the image position instead of a generic validation error.
 */
export function assertBodyImageAlts(body: BlogBlock[]): void {
  const missing = missingBodyImageAlts(body);
  if (missing.length === 0) return;
  const noun = missing.length === 1 ? "image" : "images";
  throw new Error(
    `Add alt text to body ${noun} ${missing.join(", ")} before saving or publishing.`,
  );
}
