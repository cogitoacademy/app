import { describe, expect, test } from "bun:test";

import { mergeAcademyClassQueryResults } from "./academy-class-page-utils";

describe("academy class query results", () => {
  test("keeps the newer postponed record when published and postponed overlap", () => {
    const publishedSnapshot = {
      id: "class-1",
      state: "published",
      version: 4,
      sessions: [{ id: "session-1" }],
    } as const;
    const postponedSnapshot = {
      ...publishedSnapshot,
      state: "postponed",
      version: 5,
      sessions: [{ id: "session-1" }, { id: "session-2" }],
    } as const;
    const anotherClass = {
      id: "class-2",
      state: "published",
      version: 2,
      sessions: [{ id: "session-3" }],
    } as const;

    const result = mergeAcademyClassQueryResults(
      [publishedSnapshot, anotherClass],
      [postponedSnapshot],
    );

    expect(result).toHaveLength(2);
    expect(result.find((record) => record.id === "class-1")).toBe(
      postponedSnapshot,
    );
    expect(result).toContain(anotherClass);
  });

  test("keeps the newer published record when a postponed snapshot is stale", () => {
    const publishedSnapshot = {
      id: "class-1",
      state: "published",
      version: 6,
    } as const;
    const postponedSnapshot = {
      id: "class-1",
      state: "postponed",
      version: 5,
    } as const;

    const result = mergeAcademyClassQueryResults(
      [publishedSnapshot],
      [postponedSnapshot],
    );

    expect(result).toEqual([publishedSnapshot]);
  });
});
