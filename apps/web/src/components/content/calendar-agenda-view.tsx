"use client";

import { format } from "date-fns";
import { Text } from "@cogito-app/ui/components/selia/text";
import { IconCalendarEvent } from "@tabler/icons-react";
import { useMemo, type MouseEvent } from "react";

import { EmptyState } from "@/components/empty-state";
import { CalendarEventItem } from "./calendar-event-item";
import { AGENDA_DAYS_TO_SHOW, getAgendaOccurrences } from "./calendar-utils";
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
  const agendaEvents = useMemo(
    () => getAgendaOccurrences(events, currentDate, AGENDA_DAYS_TO_SHOW),
    [currentDate, events],
  );

  return (
    <div className="border-t border-border/70 px-4">
      {agendaEvents.length === 0 ? (
        <EmptyState
          icon={<IconCalendarEvent />}
          title="No events in this period"
          description="Events scheduled for these dates will appear here."
          className="min-h-[70svh]"
          tone="secondary"
        />
      ) : (
        <ul className="space-y-2 py-6">
          {agendaEvents.map(({ event, day, key }) => (
            <li key={key}>
              <Text className="mb-1 text-muted">
                {format(day, "EEEE, d MMMM yyyy")} · WIB
              </Text>
              <CalendarEventItem
                event={event}
                view="agenda"
                onClick={(clickEvent: MouseEvent<HTMLButtonElement>) => {
                  clickEvent.stopPropagation();
                  onEventSelect(event);
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
