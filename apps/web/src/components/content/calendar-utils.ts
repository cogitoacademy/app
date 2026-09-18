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
import { getCompetitionFieldClass } from "@/lib/competition-colors";

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

export function getCategoryEventClass(coreCategory?: string) {
  return getCompetitionFieldClass(coreCategory, "soft");
}

export function getCategoryBadgeClass(coreCategory?: string) {
  return getCompetitionFieldClass(coreCategory, "solid");
}

export function getBorderRadiusClass(isFirstDay: boolean, isLastDay: boolean) {
  if (isFirstDay && isLastDay) return "rounded";
  if (isFirstDay) return "rounded-r-none";
  if (isLastDay) return "rounded-r-sm rounded-l-none";
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

export const competitionTypeOptions = [
  "mun",
  "olimpiade",
  "wsc",
  "kti",
  "debat",
  "business",
  "pidato",
] as const;

export function filterEventsByCompetitionType(
  events: CalendarCompetition[],
  selected: ReadonlySet<string>,
): CalendarCompetition[] {
  if (selected.size >= competitionTypeOptions.length) return events;
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
