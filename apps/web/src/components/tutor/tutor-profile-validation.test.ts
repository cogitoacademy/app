import { describe, expect, test } from "bun:test";

import { validateTutorAchievementDraft } from "./tutor-achievements";
import { validateTutorExperienceDraft } from "./tutor-experiences";

describe("tutor profile text validation", () => {
  test("allows surrounding whitespace around max-length achievements", () => {
    const exactlyMax = "x".repeat(255);

    expect(
      validateTutorAchievementDraft(
        [{ university: ` ${exactlyMax} `, degree: ` ${exactlyMax} ` }],
        [
          {
            competitionName: ` ${exactlyMax} `,
            year: 2026,
            awards: ["Award"],
          },
        ],
      ),
    ).toEqual({});
  });

  test("allows surrounding whitespace around max-length experiences", () => {
    const roleOrOrganization = "r".repeat(255);
    const description = "d".repeat(1_000);

    expect(
      validateTutorExperienceDraft([
        {
          role: ` ${roleOrOrganization} `,
          organization: ` ${roleOrOrganization} `,
          startYear: 2020,
          endYear: null,
          description: ` ${description} `,
        },
      ]),
    ).toEqual({});
  });
});
