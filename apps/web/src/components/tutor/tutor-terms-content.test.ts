import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseTermsDocument } from "../legal/terms-document";

const document = readFileSync(
  join(import.meta.dir, "tutor-terms-2026-11.md"),
  "utf8",
);

test("November tutor terms contain all clauses in both languages", () => {
  const blocks = parseTermsDocument(document);
  expect(blocks.filter((block) => block.type === "title")).toHaveLength(2);
  expect(blocks.filter((block) => /^Pasal \d+:/.test(block.text))).toHaveLength(
    14,
  );
  expect(
    blocks.filter((block) => /^Clause \d+:/.test(block.text)),
  ).toHaveLength(14);
  expect(
    blocks.some((block) => block.text.includes("Surabaya District Court")),
  ).toBe(true);
});
