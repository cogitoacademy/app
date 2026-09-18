import { describe, expect, test } from "bun:test";

import { SANITY_STUDIO_URL, sanityStudioStructureUrl } from "./sanity-studio";

describe("Sanity Studio edit links", () => {
  test("points at the Cogito Academy studio", () => {
    expect(SANITY_STUDIO_URL).toBe("https://cogitoacademy.sanity.studio");
  });

  test("links to the document-type list in the structure tool", () => {
    expect(sanityStudioStructureUrl("studentResource")).toBe(
      "https://cogitoacademy.sanity.studio/structure/studentResource",
    );
    expect(sanityStudioStructureUrl("competition")).toBe(
      "https://cogitoacademy.sanity.studio/structure/competition",
    );
  });
});
