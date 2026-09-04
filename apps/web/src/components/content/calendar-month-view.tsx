"use client";

import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { IconCalendarEvent } from "@tabler/icons-react";
import { useMemo, useState, type MouseEvent } from "react";

import { Button } from "@cogito-app/ui/components/selia/button";

import { EmptyState } from "@/components/empty-state";
import { CalendarEventItem } from "./calendar-event-item";
import { CalendarEventsPopup } from "./calendar-events-popup";
import {
  EVENT_GAP,
  EVENT_HEIGHT,
  getEventLanesForWeek,
  getAllEventsForDay,
  getEventsForDay,
  getSpanningEventsForDay,
} from "./calendar-utils";
import type { CalendarCompetition } from "./calendar-types";
import { useEventVisibility } from "./use-event-visibility";

export function CalendarMonthView({
  currentDate,
  events,
  onEventSelect,
}: {
  currentDate: Date;
  events: CalendarCompetition[];
  onEventSelect: (event: CalendarCompetition) => void;
}) {
  const [overflow, setOverflow] = useState<{
    date: Date;
    events: CalendarCompetition[];
    position: { top: number; left: number };
  } | null>(null);
  const { contentRef, getVisibleEventCount } = useEventVisibility({
    eventGap: EVENT_GAP,
    eventHeight: EVENT_HEIGHT,
    measurementKey: currentDate.getTime(),
  });

  const days = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    return eachDayOfInterval({
      end: endOfWeek(endOfMonth(monthStart), { weekStartsOn: 0 }),
      start: startOfWeek(monthStart, { weekStartsOn: 0 }),
    });
  }, [currentDate]);

  const weekdays = useMemo(() => {
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 0 });
    return Array.from({ length: 7 }, (_, index) =>
      format(addDays(weekStart, index), "EEE"),
    );
  }, []);

  const weeks = useMemo(() => {
    const result: Date[][] = [];
    for (let index = 0; index < days.length; index += 7) {
      result.push(days.slice(index, index + 7));
    }
    return result;
  }, [days]);

  const hasEvents = useMemo(
    () => days.some((day) => getAllEventsForDay(events, day).length > 0),
    [days, events],
  );

  function handleMoreClick(
    day: Date,
    dayEvents: CalendarCompetition[],
    event: MouseEvent<HTMLButtonElement>,
  ) {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setOverflow({
      date: day,
      events: dayEvents,
      position: {
        left: rect.left,
        top: rect.bottom + 6,
      },
    });
  }

  if (!hasEvents) {
    return (
      <EmptyState
        icon={<IconCalendarEvent />}
        title="No events this month"
        description="Events scheduled for this month will appear here."
        className="min-h-[28rem]"
      />
    );
  }

  return (
    <div className="relative overflow-x-auto overscroll-x-none">
      <div className="min-w-[720px] lg:min-w-0">
        <div className="grid grid-cols-7 border-y border-border bg-accent/40">
          {weekdays.map((weekday) => (
            <div
              key={weekday}
              className="px-2 py-2 text-center text-xs font-medium text-muted sm:text-sm"
            >
              {weekday}
            </div>
          ))}
        </div>
        <div className="grid auto-rows-fr">
          {weeks.map((week) => {
            const eventLanes = getEventLanesForWeek(events, week);
            const laneCount = eventLanes.size
              ? Math.max(...eventLanes.values()) + 1
              : 0;
            const visibleLaneCount = getVisibleEventCount(laneCount);

            return (
              <div
                key={week[0].toISOString()}
                className="grid grid-cols-7 [&:last-child>*]:border-b-0"
              >
                {week.map((day, dayIndex) => {
                  const dayEvents = getEventsForDay(events, day);
                  const spanningEvents = getSpanningEventsForDay(events, day);
                  const allDayEvents = [...spanningEvents, ...dayEvents];
                  const allEvents = getAllEventsForDay(events, day);
                  const eventsByLane = new Map(
                    allDayEvents.map((event) => [
                      eventLanes.get(event.id),
                      event,
                    ]),
                  );
                  const hiddenEvents = allDayEvents.filter((event) => {
                    const lane = eventLanes.get(event.id);
                    return lane === undefined || lane >= visibleLaneCount;
                  });
                  const isReferenceCell = week[0] === day && dayIndex === 0;
                  const hasMore = hiddenEvents.length > 0;

                  return (
                    <div
                      key={day.toISOString()}
                      className="group min-h-28 border-r border-b border-border bg-card p-1.5 last:border-r-0 sm:min-h-32"
                      data-outside-cell={
                        !isSameMonth(day, currentDate) || undefined
                      }
                      data-today={isToday(day) || undefined}
                    >
                      <div
                        className="mb-1 flex size-6 items-center justify-center rounded-full text-xs text-muted group-data-[outside-cell=true]:text-dimmed group-data-[today=true]:bg-cogito-orange group-data-[today=true]:font-semibold group-data-[today=true]:text-primary-foreground"
                        aria-label={format(day, "d MMMM yyyy")}
                      >
                        {format(day, "d")}
                      </div>
                      <div
                        ref={isReferenceCell ? contentRef : undefined}
                        className="min-h-[calc((var(--event-height)+var(--event-gap))*3)] lg:min-h-[calc((var(--event-height)+var(--event-gap))*4)]"
                      >
                        {Array.from({ length: visibleLaneCount }, (_, lane) => {
                          const calendarEvent = eventsByLane.get(lane);

                          if (!calendarEvent) {
                            return (
                              <div
                                key={`${day.toISOString()}-lane-${lane}`}
                                aria-hidden="true"
                                className="mt-(--event-gap) h-(--event-height)"
                              />
                            );
                          }

                          const eventStart = new Date(calendarEvent.start);
                          const eventEnd = new Date(calendarEvent.end);
                          const isFirstDay = isSameDay(day, eventStart);
                          const isLastDay = isSameDay(day, eventEnd);

                          return (
                            <CalendarEventItem
                              key={`${calendarEvent.id}-${day.toISOString()}`}
                              event={calendarEvent}
                              view="month"
                              isFirstDay={isFirstDay}
                              isLastDay={isLastDay}
                              onClick={(clickEvent) => {
                                clickEvent.stopPropagation();
                                onEventSelect(calendarEvent);
                              }}
                              isContinuation={!isFirstDay}
                            />
                          );
                        })}
                        {hasMore ? (
                          <Button
                            type="button"
                            variant="plain"
                            size="xs"
                            className="mt-(--event-gap) w-full justify-start px-1 text-[10px] text-muted sm:px-2 sm:text-xs"
                            aria-label={`Show ${hiddenEvents.length} more events on ${format(day, "d MMMM yyyy")}`}
                            onClick={(clickEvent) =>
                              handleMoreClick(day, allEvents, clickEvent)
                            }
                          >
                            + {hiddenEvents.length} more
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      {overflow ? (
        <CalendarEventsPopup
          date={overflow.date}
          events={overflow.events}
          position={overflow.position}
          onClose={() => setOverflow(null)}
          onEventSelect={(event) => {
            setOverflow(null);
            onEventSelect(event);
          }}
        />
      ) : null}
    </div>
  );
}
