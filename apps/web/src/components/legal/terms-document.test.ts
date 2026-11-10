import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { parseTermsDocument, splitTermsEmphasis } from "./terms-document";

const document = readFileSync(
  join(import.meta.dir, "student-terms-2026-11.md"),
  "utf8",
);

describe("November 2026 student terms", () => {
  test("renders both language versions and all 19 clauses", () => {
    const blocks = parseTermsDocument(document);
    expect(blocks.filter((block) => block.type === "title")).toHaveLength(2);
    expect(
      blocks.filter((block) => /^Pasal \d+:/.test(block.text)),
    ).toHaveLength(19);
    expect(
      blocks.filter((block) => /^Clause \d+:/.test(block.text)),
    ).toHaveLength(19);
    expect(blocks.some((block) => block.text.includes("Orang Tua/Wali"))).toBe(
      true,
    );
    expect(blocks.some((block) => block.text.includes("Parent/Guardian"))).toBe(
      true,
    );
  });

  test("preserves text while separating emphasis", () => {
    expect(splitTermsEmphasis("Use *Marks* and **agree**.")).toEqual([
      { text: "Use ", emphasis: null },
      { text: "Marks", emphasis: "em" },
      { text: " and ", emphasis: null },
      { text: "agree", emphasis: "strong" },
      { text: ".", emphasis: null },
    ]);
    expect(splitTermsEmphasis("Use _Marks_ and __agree__.")).toEqual([
      { text: "Use ", emphasis: null },
      { text: "Marks", emphasis: "em" },
      { text: " and ", emphasis: null },
      { text: "agree", emphasis: "strong" },
      { text: ".", emphasis: null },
    ]);
  });
});
