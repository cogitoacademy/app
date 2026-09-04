import { describe, expect, test } from "bun:test";

import { getCategoryLabel } from "./knowledge-bank-utils";

describe("Knowledge Bank category labels", () => {
  test("maps known resource category slugs to readable labels", () => {
    expect(getCategoryLabel("position-paper")).toBe("Position Paper");
    expect(getCategoryLabel("resolution-bank")).toBe("Resolution Bank");
    expect(getCategoryLabel("study-guide")).toBe("Study Guide");
    expect(getCategoryLabel("other")).toBe("Other");
  });

  test("formats unknown hyphenated slugs instead of exposing the raw case", () => {
    expect(getCategoryLabel("dsadas-sda")).toBe("Dsadas Sda");
  });
});
