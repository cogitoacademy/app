import { describe, expect, test } from "bun:test";

import {
  getCompetitionField,
  getCompetitionFieldClass,
} from "./competition-colors";

describe("competition field colors", () => {
  test.each([
    ["competition-model-united-nations", "mun"],
    ["competition-world-scholars-cup", "wsc"],
    ["competition-essay-writing", "kti"],
    ["competition-debate", "debat"],
    ["competition-business", "business"],
    ["competition-olympiad", "olimpiade"],
    ["competition-public-speaking", "pidato"],
  ] as const)("maps taxonomy slug %s", (slug, expected) => {
    expect(getCompetitionField(slug)).toBe(expected);
  });

  test("supports legacy specialization slugs", () => {
    expect(getCompetitionField("mun-writing")).toBe("mun");
    expect(getCompetitionField("science-olympiad")).toBe("olimpiade");
    expect(getCompetitionField("public-speaking-storytelling")).toBe("pidato");
  });

  test("falls back to research for unknown fields", () => {
    expect(getCompetitionField("unknown-field")).toBe("kti");
    expect(getCompetitionFieldClass("unknown-field", "solid")).toContain(
      "bg-competition-research",
    );
  });

  test("provides solid classes for competition badges", () => {
    expect(getCompetitionFieldClass("mun", "solid")).toContain(
      "text-competition-mun-foreground",
    );
    expect(getCompetitionFieldClass("business", "solid")).toContain(
      "text-competition-business-foreground",
    );
  });
});
