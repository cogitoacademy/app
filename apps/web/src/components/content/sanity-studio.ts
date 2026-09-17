export const SANITY_STUDIO_URL = "https://cogitoacademy.sanity.studio";

export type SanityStudioStructureType = "studentResource" | "competition";

export function sanityStudioStructureUrl(
  type: SanityStudioStructureType,
): string {
  return `${SANITY_STUDIO_URL}/structure/${type}`;
}
