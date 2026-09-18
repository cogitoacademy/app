import { describe, expect, test } from "bun:test";

import {
  buildTutorReviewDiffs,
  filterTutorReviewDiffs,
  getTutorReviewDiffStatus,
  isTutorReviewValueEmpty,
  summarizeTutorReviewDiffs,
} from "./tutor-review-diff";

describe("tutor review diff status", () => {
  test("classifies empty, added, modified, removed, and filled values", () => {
    expect(getTutorReviewDiffStatus(null, [])).toBe("empty");
    expect(getTutorReviewDiffStatus("", "A short bio")).toBe("added");
    expect(getTutorReviewDiffStatus("Before", "After")).toBe("modified");
    expect(getTutorReviewDiffStatus("Before", "")).toBe("removed");
    expect(getTutorReviewDiffStatus("  Same value ", "Same value")).toBe(
      "filled",
    );
  });

  test("normalizes blank values and compares subject IDs as a set", () => {
    expect(isTutorReviewValueEmpty({ online: 0 })).toBe(true);
    expect(isTutorReviewValueEmpty({ online: 42 })).toBe(false);
    expect(
      getTutorReviewDiffStatus(
        ["subject-a", "subject-b"],
        [" subject-b ", "subject-a"],
        "subjectIds",
      ),
    ).toBe("filled");
  });
});

describe("tutor review diff filtering", () => {
  const entries = buildTutorReviewDiffs(
    [
      ["shortBio", "New bio"],
      ["education", []],
      ["prices", { "1": 42 }],
    ],
    (field) =>
      field === "shortBio"
        ? "Old bio"
        : field === "education"
          ? [{ university: "Cogito", degree: "M.Ed." }]
          : null,
    (field) =>
      ({ shortBio: "Short bio", education: "Education", prices: "Marks" })[
        field
      ] ?? field,
  );

  test("composes status and label search filters", () => {
    expect(filterTutorReviewDiffs(entries, "modified", "marks")).toHaveLength(
      0,
    );
    expect(
      filterTutorReviewDiffs(entries, "modified", "bio").map(
        (entry) => entry.field,
      ),
    ).toEqual(["shortBio"]);
    expect(
      filterTutorReviewDiffs(entries, "removed", "education").map(
        (entry) => entry.field,
      ),
    ).toEqual(["education"]);
  });

  test("summarizes every status without dropping filled rows", () => {
    const summary = summarizeTutorReviewDiffs([
      ...entries,
      {
        field: "same",
        label: "Same",
        current: "value",
        proposed: "value",
        status: "filled",
      },
    ]);
    expect(summary).toEqual({
      added: 1,
      modified: 1,
      removed: 1,
      filled: 1,
      empty: 0,
    });
  });
});
