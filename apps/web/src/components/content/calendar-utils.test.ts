import { describe, expect, test } from "bun:test";

import {
  competitionTypeOptions,
  filterEventsByCompetitionType,
  getCategoryLabel,
  getAgendaEventsForPeriod,
  sortDayEvents,
} from "./calendar-utils";
import type { CalendarCompetition } from "./calendar-types";

function makeEvent(id: string, coreCategories: string[]): CalendarCompetition {
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
