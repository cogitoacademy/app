"use client";

import { addDays, format, isToday } from "date-fns";
import { IconCalendarEvent } from "@tabler/icons-react";
import { useMemo, type MouseEvent } from "react";

import { Heading } from "@cogito-app/ui/components/selia/heading";
import { Text } from "@cogito-app/ui/components/selia/text";

import { CalendarEventItem } from "./calendar-event-item";
import { AGENDA_DAYS_TO_SHOW, getAgendaEventsForDay } from "./calendar-utils";
import type { CalendarCompetition } from "./calendar-types";

export function CalendarAgendaView({
  currentDate,
  events,
  onEventSelect,
}: {
  currentDate: Date;
  events: CalendarCompetition[];
  onEventSelect: (event: CalendarCompetition) => void;
}) {
  const days = useMemo(
    () =>
      Array.from({ length: AGENDA_DAYS_TO_SHOW }, (_, index) =>
        addDays(new Date(currentDate), index),
      ),
    [currentDate],
  );

  const hasEvents = useMemo(
    () => days.some((day) => getAgendaEventsForDay(events, day).length > 0),
    [days, events],
  );

  return (
    <div className="border-t border-border/70 px-4">
      {!hasEvents ? (
        <div className="flex min-h-[70svh] flex-col items-center justify-center py-16 text-center">
          <IconCalendarEvent className="mb-2 size-8 text-dimmed" />
          <Heading size="sm">No events found</Heading>
          <Text className="mt-1 text-muted">
            There are no events scheduled for this time period.
          </Text>
        </div>
      ) : (
        days.map((day) => {
          const dayEvents = getAgendaEventsForDay(events, day);

          if (dayEvents.length === 0) return null;

          return (
            <div
              key={day.toISOString()}
              className="relative my-6 border-t border-border/70"
            >
              <span
                className="absolute -top-3 left-0 flex h-6 items-center bg-card pe-4 text-[10px] uppercase text-muted sm:text-xs"
                data-today={isToday(day) || undefined}
              >
                {format(day, "d MMM, EEEE")}
              </span>
              <div className="mt-6 space-y-2">
                {dayEvents.map((event) => (
                  <CalendarEventItem
                    key={event.id}
                    event={event}
                    view="agenda"
                    onClick={(clickEvent: MouseEvent<HTMLButtonElement>) => {
                      clickEvent.stopPropagation();
                      onEventSelect(event);
                    }}
                  />
                ))}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
