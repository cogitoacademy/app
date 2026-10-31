import { describe, expect, test } from "bun:test";

import { countTutorShortBioWords } from "../../modules/tutor/tutor.types";

describe("countTutorShortBioWords", () => {
  test("returns zero for an empty or whitespace-only bio", () => {
    expect(countTutorShortBioWords("")).toBe(0);
    expect(countTutorShortBioWords("   \n\t ")).toBe(0);
  });

  test("counts whitespace-separated words after trimming", () => {
    expect(countTutorShortBioWords("  two   words  ")).toBe(2);
    expect(countTutorShortBioWords("one")).toBe(1);
  });
});
