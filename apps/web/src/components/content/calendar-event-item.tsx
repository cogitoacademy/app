"use client";

import { isPast } from "date-fns";
import { IconArrowUpRight } from "@tabler/icons-react";
import type { MouseEvent } from "react";

import { Text } from "@cogito-app/ui/components/selia/text";
import { cn } from "@cogito-app/ui/lib/utils";

import {
  formatCompetitionDates,
  getBorderRadiusClass,
  getCategoryEventClass,
} from "./calendar-utils";
import type { CalendarCompetition } from "./calendar-types";

type CalendarEventView = "month" | "agenda";

export function CalendarEventItem({
  event,
  view,
  isFirstDay = true,
  isLastDay = true,
  isContinuation = false,
  onClick,
}: {
  event: CalendarCompetition;
  view: CalendarEventView;
  isFirstDay?: boolean;
  isLastDay?: boolean;
  isContinuation?: boolean;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const isEventInPast = isPast(new Date(event.end));
  const category = event.categories[0]?.coreCategory;
  const eventClass = getCategoryEventClass(category);

  if (view === "month") {
    return (
      <button
        type="button"
        aria-label={`View details for ${event.title}`}
        className={cn(
          "relative mt-(--event-gap) flex h-(--event-height) w-full select-none items-center overflow-hidden px-2 text-left text-[10px] font-medium outline-none backdrop-blur-sm transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary sm:text-xs",
          eventClass,
          getBorderRadiusClass(isFirstDay, isLastDay),
          isFirstDay && "border-l-4",
          isEventInPast && "opacity-70",
        )}
        onClick={onClick}
      >
        {isContinuation ? (
          <span className="invisible">{event.title}</span>
        ) : (
          <span className="truncate">{event.title}</span>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-label={`View details for ${event.title}`}
      className={cn(
        "flex w-full flex-col gap-2 rounded-xl border-l-4 p-4 text-left outline-none transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        eventClass,
        isEventInPast && "opacity-70",
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-base font-semibold sm:text-lg">
            {event.title}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            {event.organizer ? <span>{event.organizer}</span> : null}
            {event.organizer && event.scale ? (
              <span aria-hidden="true" className="text-current/50">
                ·
              </span>
            ) : null}
            {event.scale ? (
              <span className="capitalize">{event.scale}</span>
            ) : null}
            {(event.organizer || event.scale) && event.location ? (
              <span aria-hidden="true" className="text-current/50">
                ·
              </span>
            ) : null}
            {event.location ? <span>{event.location}</span> : null}
          </div>
        </div>
        <IconArrowUpRight className="size-5 shrink-0" aria-hidden="true" />
      </div>
      <Text className="text-sm text-current/75">
        {formatCompetitionDates(event)}
      </Text>
    </button>
  );
}
