import {
  endOfDay,
  format,
  isSameDay,
  isWithinInterval,
  startOfDay,
} from "date-fns";

import type { CalendarCompetition } from "./calendar-types";

export const EVENT_HEIGHT = 24;
export const EVENT_GAP = 4;
export const AGENDA_DAYS_TO_SHOW = 30;

const categoryEventStyles: Record<string, string> = {
  mun: "bg-info/15 text-info hover:bg-info/25 border-info",
  olimpiade: "bg-danger/15 text-danger hover:bg-danger/25 border-danger",
  wsc: "bg-warning/15 text-warning hover:bg-warning/25 border-warning",
  kti: "bg-primary/15 text-primary hover:bg-primary/25 border-primary",
  debat:
    "bg-secondary/20 text-secondary-foreground hover:bg-secondary/30 border-secondary",
  business: "bg-success/15 text-success hover:bg-success/25 border-success",
  pidato: "bg-tertiary/15 text-tertiary hover:bg-tertiary/25 border-tertiary",
};

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
  return (
    categoryEventStyles[coreCategory ?? ""] ??
    "bg-primary/15 text-primary hover:bg-primary/25 border-primary"
  );
}

export function getBorderRadiusClass(isFirstDay: boolean, isLastDay: boolean) {
  if (isFirstDay && isLastDay) return "rounded";
  if (isFirstDay) return "rounded-l-sm rounded-r-none";
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

export function getAgendaEventsForDay(
  events: CalendarCompetition[],
  day: Date,
) {
  return getAllEventsForDay(events, day);
}

export function getEventLanesForWeek(
  events: CalendarCompetition[],
  week: Date[],
) {
  const weekEvents = new Map<string, CalendarCompetition>();

  for (const day of week) {
    for (const event of getAllEventsForDay(events, day)) {
      weekEvents.set(event.id, event);
    }
  }

  const orderedEvents = [...weekEvents.values()].toSorted((left, right) => {
    const startDifference =
      new Date(left.start).getTime() - new Date(right.start).getTime();
    if (startDifference !== 0) return startDifference;

    const endDifference =
      new Date(right.end).getTime() - new Date(left.end).getTime();
    if (endDifference !== 0) return endDifference;

    return left.id.localeCompare(right.id);
  });

  const laneEndTimes: number[] = [];
  const eventLanes = new Map<string, number>();

  for (const event of orderedEvents) {
    const eventStart = startOfDay(new Date(event.start)).getTime();
    const eventEnd = endOfDay(new Date(event.end)).getTime();
    const availableLane = laneEndTimes.findIndex(
      (laneEnd) => laneEnd < eventStart,
    );
    const lane = availableLane === -1 ? laneEndTimes.length : availableLane;

    laneEndTimes[lane] = eventEnd;
    eventLanes.set(event.id, lane);
  }

  return eventLanes;
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
