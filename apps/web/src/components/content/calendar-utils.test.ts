import { describe, expect, test } from "bun:test";

import {
  competitionTypeOptions,
  filterEventsByCompetitionType,
  getCategoryLabel,
} from "./calendar-utils";
import type { CalendarCompetition } from "./calendar-types";

function makeEvent(
  id: string,
  coreCategories: string[],
): CalendarCompetition {
  return {
    id,
    title: id,
    description: null,
    start: new Date("2026-10-01T09:00:00+07:00"),
    end: new Date("2026-10-01T10:30:00+07:00"),
    location: null,
    categories: coreCategories.map((coreCategory) => ({
      name: coreCategory,
      coreCategory,
    })),
    educationLevels: [],
    scale: null,
    organizer: null,
    registrationDeadline: null,
    registrationLink: null,
    socialMediaLink: null,
  };
}

const ALL = new Set(competitionTypeOptions);

describe("competitionTypeOptions", () => {
  test("exposes the fixed 7 types with resolving labels", () => {
    expect([...competitionTypeOptions]).toEqual([
      "mun",
      "olimpiade",
      "wsc",
      "kti",
      "debat",
      "business",
      "pidato",
    ]);
    expect(getCategoryLabel("mun")).toBe("Model United Nations");
    for (const value of competitionTypeOptions) {
      expect(getCategoryLabel(value)).not.toBe(value);
    }
  });
});

describe("filterEventsByCompetitionType", () => {
  test("returns all events when every type is selected", () => {
    const events = [makeEvent("a", ["mun"]), makeEvent("b", ["debat"])];
    expect(filterEventsByCompetitionType(events, ALL)).toBe(events);
  });

  test("keeps events matching any selected type", () => {
    const events = [
      makeEvent("a", ["mun"]),
      makeEvent("b", ["mun", "debat"]),
      makeEvent("c", ["debat"]),
    ];
    const result = filterEventsByCompetitionType(events, new Set(["mun"]));
    expect(result.map((event) => event.id)).toEqual(["a", "b"]);
  });

  test("hides events with no categories under a partial selection", () => {
    const events = [makeEvent("a", []), makeEvent("b", ["mun"])];
    const result = filterEventsByCompetitionType(events, new Set(["mun"]));
    expect(result.map((event) => event.id)).toEqual(["b"]);
  });

  test("hides unknown categories under a partial selection", () => {
    const events = [makeEvent("a", ["mystery"]), makeEvent("b", ["wsc"])];
    const result = filterEventsByCompetitionType(events, new Set(["wsc"]));
    expect(result.map((event) => event.id)).toEqual(["b"]);
  });

  test("empty selection matches nothing", () => {
    const events = [makeEvent("a", ["mun"])];
    expect(filterEventsByCompetitionType(events, new Set())).toEqual([]);
  });
});
