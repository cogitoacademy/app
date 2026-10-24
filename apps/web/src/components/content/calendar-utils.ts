import {
  addDays,
  endOfDay,
  format,
  isAfter,
  isBefore,
  isSameDay,
  isWithinInterval,
  startOfDay,
} from "date-fns";

import type { CalendarCompetition } from "./calendar-types";
import {
  competitionPaletteClassName,
  competitionPaletteSubtleClassName,
} from "@/lib/competition-colors";

export const EVENT_HEIGHT = 24;
export const EVENT_GAP = 4;
export const AGENDA_DAYS_TO_SHOW = 30;

const categoryLabels: Record<string, string> = {
  mun: "Model United Nations",
  olimpiade: "Olympiad",
  wsc: "World Scholar's Cup",
  kti: "Research & Essay",
  debat: "Debate",
  business: "Business Plan",
  pidato: "Speech",
};

const educationLevelLabels: Record<string, string> = {
  sd: "Elementary",
  smp: "Middle school",
  sma: "High school",
  mahasiswa: "University",
};

export function getCategoryLabel(coreCategory: string) {
  return categoryLabels[coreCategory] ?? coreCategory;
}

export function getEducationLevelLabel(level: string) {
  return educationLevelLabels[level] ?? level;
}

export function getCategoryEventClass(
  category?: CalendarCompetition["categories"][number],
) {
  if (category?.parentColors) return competitionPaletteSubtleClassName;
  return "bg-accent/30 text-foreground border-border";
}

export function getCategoryBadgeClass(
  category?: CalendarCompetition["categories"][number],
) {
  if (category?.parentColors) return competitionPaletteClassName;
  return "bg-accent/30 text-foreground border-border";
}

export function getBorderRadiusClass(isFirstDay: boolean, isLastDay: boolean) {
  if (isFirstDay && isLastDay) return "rounded-l-none rounded-r-xs";
  if (isFirstDay) return "rounded-r-none";
  if (isLastDay) return "rounded-r-xs rounded-l-none";
  return "rounded-none";
}

export function isMultiDayEvent(event: CalendarCompetition) {
  return event.allDay || !isSameDay(new Date(event.start), new Date(event.end));
}

export function getEventsForDay(events: CalendarCompetition[], day: Date) {
  return events
    .filter((event) => isSameDay(day, new Date(event.start)))
    .toSorted(
      (left, right) =>
        new Date(left.start).getTime() - new Date(right.start).getTime(),
    );
}

export function getSpanningEventsForDay(
  events: CalendarCompetition[],
  day: Date,
) {
  return events
    .filter((event) => {
      if (!isMultiDayEvent(event)) return false;

      const start = new Date(event.start);
      const end = new Date(event.end);
      return (
        !isSameDay(day, start) &&
        isWithinInterval(day, {
          end: endOfDay(end),
          start: startOfDay(start),
        })
      );
    })
    .toSorted(
      (left, right) =>
        new Date(left.start).getTime() - new Date(right.start).getTime(),
    );
}

export function getAllEventsForDay(events: CalendarCompetition[], day: Date) {
  return events
    .filter((event) =>
      isWithinInterval(day, {
        end: endOfDay(new Date(event.end)),
        start: startOfDay(new Date(event.start)),
      }),
    )
    .toSorted(
      (left, right) =>
        new Date(left.start).getTime() - new Date(right.start).getTime(),
    );
}

export function getAgendaEventsForPeriod(
  events: CalendarCompetition[],
  currentDate: Date,
  daysToShow = AGENDA_DAYS_TO_SHOW,
) {
  const periodStart = startOfDay(currentDate);
  const periodEnd = endOfDay(addDays(periodStart, daysToShow - 1));
  const uniqueEvents = new Map<string, CalendarCompetition>();

  for (const event of events) {
    const eventStart = new Date(event.start);
    const eventEnd = new Date(event.end);

    if (
      isBefore(eventEnd, periodStart) ||
      isAfter(eventStart, periodEnd) ||
      uniqueEvents.has(event.id)
    ) {
      continue;
    }

    uniqueEvents.set(event.id, event);
  }

  return [...uniqueEvents.values()].toSorted(
    (left, right) =>
      new Date(left.start).getTime() - new Date(right.start).getTime(),
  );
}

export function formatCompetitionDates(event: CalendarCompetition) {
  if (isSameDay(event.start, event.end)) {
    return format(event.start, "d MMMM yyyy");
  }

  if (event.start.getFullYear() === event.end.getFullYear()) {
    return `${format(event.start, "d MMM")} – ${format(event.end, "d MMM yyyy")}`;
  }

  return `${format(event.start, "d MMM yyyy")} – ${format(event.end, "d MMM yyyy")}`;
}

export type CompetitionTypeOption = {
  value: string;
  label: string;
};

export function getCompetitionTypeOptions(
  events: CalendarCompetition[],
): CompetitionTypeOption[] {
  const labels = new Map<string, string>();

  for (const event of events) {
    for (const category of event.categories) {
      if (!category.coreCategory) continue;
      if (!labels.has(category.coreCategory)) {
        labels.set(
          category.coreCategory,
          category.name.trim() || getCategoryLabel(category.coreCategory),
        );
      }
    }
  }

  return [...labels].map(([value, label]) => ({ value, label }));
}

export function getSelectedCompetitionTypes(
  options: CompetitionTypeOption[],
  excludedTypes: ReadonlySet<string>,
): ReadonlySet<string> {
  return new Set(
    options
      .map(({ value }) => value)
      .filter((value) => !excludedTypes.has(value)),
  );
}

export function filterEventsByCompetitionType(
  events: CalendarCompetition[],
  selected: ReadonlySet<string>,
): CalendarCompetition[] {
  const options = getCompetitionTypeOptions(events);
  if (options.every(({ value }) => selected.has(value))) return events;
  return events.filter((event) =>
    event.categories.some((category) => selected.has(category.coreCategory)),
  );
}

export function sortDayEvents(
  events: CalendarCompetition[],
): CalendarCompetition[] {
  return [...events].toSorted((left, right) => {
    const leftIsMultiDay = isMultiDayEvent(left);
    const rightIsMultiDay = isMultiDayEvent(right);

    if (leftIsMultiDay && !rightIsMultiDay) return -1;
    if (!leftIsMultiDay && rightIsMultiDay) return 1;

    return new Date(left.start).getTime() - new Date(right.start).getTime();
  });
}

export function getWeekEventLanes(
  events: CalendarCompetition[],
  weekStart: Date,
  weekEnd: Date,
): Map<string, number> {
  const laneEnds: number[] = [];
  const lanes = new Map<string, number>();
  const visibleEvents = events
    .filter((event) => {
      const eventStart = startOfDay(new Date(event.start));
      const eventEnd = endOfDay(new Date(event.end));
      return !isAfter(eventStart, weekEnd) && !isBefore(eventEnd, weekStart);
    })
    .toSorted((left, right) => {
      const startDifference =
        startOfDay(new Date(left.start)).getTime() -
        startOfDay(new Date(right.start)).getTime();
      if (startDifference !== 0) return startDifference;

      const endDifference =
        endOfDay(new Date(right.end)).getTime() -
        endOfDay(new Date(left.end)).getTime();
      if (endDifference !== 0) return endDifference;

      return left.id.localeCompare(right.id);
    });

  for (const event of visibleEvents) {
    const eventStart = startOfDay(new Date(event.start)).getTime();
    const eventEnd = endOfDay(new Date(event.end)).getTime();
    const availableLane = laneEnds.findIndex((laneEnd) => laneEnd < eventStart);
    const lane = availableLane === -1 ? laneEnds.length : availableLane;

    laneEnds[lane] = eventEnd;
    lanes.set(event.id, lane);
  }

  return lanes;
}

/** A display-only wall-clock Date, never persist or compare it as an instant. */
export function wibCalendarDate(value: string | Date) {
  const instant = new Date(value);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return new Date(
    n("year"),
    n("month") - 1,
    n("day"),
    n("hour"),
    n("minute"),
    n("second"),
  );
}
export function getAgendaOccurrences(
  events: CalendarCompetition[],
  currentDate: Date,
  days = AGENDA_DAYS_TO_SHOW,
) {
  const occurrences: Array<{
    event: CalendarCompetition;
    day: Date;
    key: string;
  }> = [];
  for (let offset = 0; offset < days; offset++) {
    const day = addDays(startOfDay(currentDate), offset);
    const seen = new Set<string>();
    for (const event of getAllEventsForDay(events, day)) {
      const key = `${event.id}:${format(day, "yyyy-MM-dd")}`;
      if (!seen.has(key)) occurrences.push({ event, day, key });
      seen.add(key);
    }
  }
  return occurrences;
}
