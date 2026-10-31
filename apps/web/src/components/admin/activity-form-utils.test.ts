import { describe, expect, test } from "bun:test";
import { formatPublicationState } from "./activity-form-utils";

describe("formatPublicationState", () => {
  test("capitalizes publication option labels without changing values", () => {
    expect(
      ["draft", "published", "cancelled", "postponed"].map(
        formatPublicationState,
      ),
    ).toEqual(["Draft", "Published", "Cancelled", "Postponed"]);
  });

  test("handles an empty value", () => {
    expect(formatPublicationState("")).toBe("");
  });
});
