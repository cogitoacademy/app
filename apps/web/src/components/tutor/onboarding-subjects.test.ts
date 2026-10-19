import { describe, expect, test } from "bun:test";

import {
  getTutorSubjectIdsForSave,
  requiresActiveTutorSubjectSelection,
} from "./onboarding-subjects";

describe("onboarding subject lifecycle", () => {
  test("published profiles with only archived tracks can submit unrelated edits", () => {
    expect(
      requiresActiveTutorSubjectSelection({
        isPublished: true,
        selectedSubjectIds: [],
        initialSubjectIds: [],
        preservedArchivedSubjectIds: ["archived-track"],
      }),
    ).toBe(false);
    expect(
      getTutorSubjectIdsForSave([], [], ["archived-track"]),
    ).toBeUndefined();
  });

  test("adding an active track preserves existing archived tracks", () => {
    expect(
      getTutorSubjectIdsForSave(["active-track"], [], ["archived-track"]),
    ).toEqual(["archived-track", "active-track"]);
  });

  test("a profile that had active tracks still needs one after removing them", () => {
    expect(
      requiresActiveTutorSubjectSelection({
        isPublished: true,
        selectedSubjectIds: [],
        initialSubjectIds: ["active-track"],
        preservedArchivedSubjectIds: ["archived-track"],
      }),
    ).toBe(true);
  });
});
