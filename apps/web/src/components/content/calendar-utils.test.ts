import { describe, expect, test } from "bun:test";

import {
  wibCalendarDate,
  getAgendaOccurrences,
  filterEventsByCompetitionType,
  getCategoryLabel,
  getCategoryBadgeClass,
  getCategoryEventClass,
  getAgendaEventsForPeriod,
  getCompetitionTypeOptions,
  getSelectedCompetitionTypes,
  getWeekEventLanes,
  sortDayEvents,
} from "./calendar-utils";
import type { CalendarCompetition } from "./calendar-types";
import {
  competitionPaletteClassName,
  competitionPaletteSubtleClassName,
} from "@/lib/competition-colors";

function makeEvent(
  id: string,
  coreCategories: string[],
  categoryNames = coreCategories,
): CalendarCompetition {
  return {
    id,
    title: id,
    description: null,
    start: new Date("2026-10-01T09:00:00+07:00"),
    end: new Date("2026-10-01T10:30:00+07:00"),
    location: null,
    categories: coreCategories.map((coreCategory, index) => ({
      name: categoryNames[index] ?? "",
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

describe("getCompetitionTypeOptions", () => {
  test("uses English category names for new slugs", () => {
    expect(
      getCompetitionTypeOptions([
        makeEvent("new", ["robotics"], ["Robotics & AI"]),
      ]),
    ).toEqual([{ value: "robotics", label: "Robotics & AI" }]);
  });

  test("keeps every legacy label as a fallback when category names are missing", () => {
    const fallbacks = [
      ["mun", "Model United Nations"],
      ["olimpiade", "Olympiad"],
      ["wsc", "World Scholar's Cup"],
      ["kti", "Research & Essay"],
      ["debat", "Debate"],
      ["business", "Business Plan"],
      ["pidato", "Speech"],
    ] as const;

    expect(
      getCompetitionTypeOptions([
        ...fallbacks.map(([slug]) => makeEvent(slug, [slug], [""])),
        makeEvent("unresolved", [""], ["Unresolved"]),
      ]),
    ).toEqual(fallbacks.map(([value, label]) => ({ value, label })));
    expect(getCategoryLabel("mun")).toBe("Model United Nations");
  });

  test("defaults new options on, preserves exclusions, and resets to current options", () => {
    const existingEvents = [
      makeEvent("debate", ["debat"]),
      makeEvent("mun", ["mun"]),
    ] as const;
    const refreshedEvents = [
      ...existingEvents,
      makeEvent("robotics", ["robotics"], ["Robotics & AI"]),
    ];
    const excludedTypes = new Set(["mun"]);
    const options = getCompetitionTypeOptions(refreshedEvents);

    expect([...getSelectedCompetitionTypes(options, excludedTypes)]).toEqual([
      "debat",
      "robotics",
    ]);
    expect([...getSelectedCompetitionTypes(options, new Set())]).toEqual([
      "debat",
      "mun",
      "robotics",
    ]);
  });
});

describe("competition category colors", () => {
  const palette = {
    lightTextColor: "oklch(0.2 0.02 250)",
    lightBackgroundColor: "oklch(0.96 0.03 250)",
    darkTextColor: "oklch(0.92 0.02 250)",
    darkBackgroundColor: "oklch(0.25 0.04 250)",
  };

  test("uses catalog palettes for both calendar events and detail badges", () => {
    const category = {
      id: "catalog-category",
      name: "Current label",
      coreCategory: "unknown-slug",
      parentColors: palette,
    };
    expect(getCategoryEventClass(category)).toBe(
      competitionPaletteSubtleClassName,
    );
    expect(getCategoryBadgeClass(category)).toBe(competitionPaletteClassName);
  });

  test("uses neutral colors for unresolved catalog rows", () => {
    const category = {
      id: "catalog-category",
      name: "Current label",
      coreCategory: "mun",
    };
    expect(getCategoryEventClass(category)).toContain("bg-accent/30");
    expect(getCategoryBadgeClass(category)).toContain("bg-accent/30");
  });
});

describe("filterEventsByCompetitionType", () => {
  test("returns all events when every type is selected", () => {
    const events = [
      makeEvent("a", ["mun"]),
      makeEvent("b", ["debat"]),
      makeEvent("c", []),
      makeEvent("d", [""], ["Unresolved"]),
    ];
    expect(
      filterEventsByCompetitionType(events, new Set(["mun", "debat"])),
    ).toBe(events);
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
    const events = [
      makeEvent("a", []),
      makeEvent("b", ["mun"]),
      makeEvent("c", ["wsc"]),
    ];
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

  test("filters newly configured slugs by their parent category key", () => {
    const events = [
      makeEvent("legacy", ["mun"], ["Model United Nations"]),
      makeEvent("new", ["robotics"], ["Robotics & AI"]),
    ];

    expect(
      filterEventsByCompetitionType(events, new Set(["robotics"])).map(
        (event) => event.id,
      ),
    ).toEqual(["new"]);
  });
});

describe("sortDayEvents", () => {
  function makeDatedEvent(
    id: string,
    start: string,
    end: string,
  ): CalendarCompetition {
    return {
      ...makeEvent(id, ["mun"]),
      start: new Date(start),
      end: new Date(end),
    };
  }

  test("puts multi-day events before single-day ones", () => {
    const single = makeDatedEvent(
      "single",
      "2026-08-01T09:00:00+07:00",
      "2026-08-01T10:30:00+07:00",
    );
    const multi = makeDatedEvent(
      "multi",
      "2026-07-31T09:00:00+07:00",
      "2026-08-02T10:30:00+07:00",
    );
    expect(sortDayEvents([single, multi]).map((event) => event.id)).toEqual([
      "multi",
      "single",
    ]);
  });

  test("orders same-day events by start time", () => {
    const late = makeDatedEvent(
      "late",
      "2026-08-01T14:00:00+07:00",
      "2026-08-01T15:30:00+07:00",
    );
    const early = makeDatedEvent(
      "early",
      "2026-08-01T09:00:00+07:00",
      "2026-08-01T10:30:00+07:00",
    );
    expect(sortDayEvents([late, early]).map((event) => event.id)).toEqual([
      "early",
      "late",
    ]);
  });

  test("does not mutate the input array", () => {
    const events = [
      makeDatedEvent(
        "b",
        "2026-08-01T14:00:00+07:00",
        "2026-08-01T15:30:00+07:00",
      ),
      makeDatedEvent(
        "a",
        "2026-08-01T09:00:00+07:00",
        "2026-08-01T10:30:00+07:00",
      ),
    ];
    sortDayEvents(events);
    expect(events.map((event) => event.id)).toEqual(["b", "a"]);
  });
});

describe("getWeekEventLanes", () => {
  test("keeps spanning events in one lane and reuses lanes after they end", () => {
    const endingBlue = {
      ...makeEvent("ending-blue", ["mun"]),
      start: new Date(2026, 9, 24),
      end: new Date(2026, 9, 25, 23, 59, 59),
    };
    const green = {
      ...makeEvent("green", ["business"]),
      start: new Date(2026, 9, 25),
      end: new Date(2026, 9, 27, 23, 59, 59),
    };
    const startingBlue = {
      ...makeEvent("starting-blue", ["mun"]),
      start: new Date(2026, 9, 26),
      end: new Date(2026, 9, 27, 23, 59, 59),
    };

    const lanes = getWeekEventLanes(
      [green, startingBlue, endingBlue],
      new Date(2026, 9, 25),
      new Date(2026, 9, 31, 23, 59, 59),
    );

    expect(lanes.get(endingBlue.id)).toBe(0);
    expect(lanes.get(green.id)).toBe(1);
    expect(lanes.get(startingBlue.id)).toBe(0);
  });
});

describe("getAgendaEventsForPeriod", () => {
  function makeDatedEvent(
    id: string,
    start: string,
    end: string,
  ): CalendarCompetition {
    return {
      ...makeEvent(id, ["mun"]),
      start: new Date(start),
      end: new Date(end),
    };
  }

  test("returns each overlapping competition once in first-day order", () => {
    const currentDate = new Date("2026-10-01T12:00:00+07:00");
    const later = makeDatedEvent(
      "later",
      "2026-10-10T09:00:00+07:00",
      "2026-10-12T17:00:00+07:00",
    );
    const ongoing = makeDatedEvent(
      "ongoing",
      "2026-09-30T09:00:00+07:00",
      "2026-10-03T17:00:00+07:00",
    );
    const outside = makeDatedEvent(
      "outside",
      "2026-09-20T09:00:00+07:00",
      "2026-09-29T17:00:00+07:00",
    );

    const result = getAgendaEventsForPeriod(
      [later, ongoing, ongoing, outside],
      currentDate,
    );

    expect(result.map((event) => event.id)).toEqual(["ongoing", "later"]);
  });

  test("does not include events that start after the agenda period", () => {
    const currentDate = new Date("2026-10-01T12:00:00+07:00");
    const afterPeriod = makeDatedEvent(
      "after-period",
      "2026-11-01T09:00:00+07:00",
      "2026-11-02T17:00:00+07:00",
    );

    expect(getAgendaEventsForPeriod([afterPeriod], currentDate)).toEqual([]);
  });
});

test("WIB midnight and ID/date agenda identity preserve legitimate multi-day occurrences", () => {
  const event = {
    ...makeEvent("a", []),
    title: "Same title",
    start: wibCalendarDate("2026-10-24T16:59:00Z"),
    end: wibCalendarDate("2026-10-24T17:01:00Z"),
  };
  expect(event.start.getDate()).toBe(24);
  expect(event.end.getDate()).toBe(25);
  const other = { ...event, id: "b" };
  const result = getAgendaOccurrences(
    [event, event, other],
    new Date(2026, 9, 24),
    2,
  );
  expect(result.map((r) => r.key)).toEqual([
    "a:2026-10-24",
    "b:2026-10-24",
    "a:2026-10-25",
    "b:2026-10-25",
  ]);
});
