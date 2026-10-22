import { describe, expect, test } from "bun:test";
import { isLegacyFeedbackVersion } from "../../modules/report-export/report-export.legacy";

describe("private report history layout", () => {
  test("uses the current version history and treats pre-history reports as legacy", () => {
    expect(isLegacyFeedbackVersion([], 1)).toBe(true);
    expect(
      isLegacyFeedbackVersion([{ version: 1, actorRole: "legacy" }], 1),
    ).toBe(true);
    expect(
      isLegacyFeedbackVersion(
        [
          { version: 1, actorRole: "legacy" },
          { version: 2, actorRole: "admin" },
        ],
        2,
      ),
    ).toBe(false);
    expect(
      isLegacyFeedbackVersion([{ version: 1, actorRole: "tutor" }], 1),
    ).toBe(false);
  });
});
