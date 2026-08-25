"use client";

import { format, isSameDay } from "date-fns";
import { IconCalendarEvent, IconX } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@cogito-app/ui/components/selia/button";
import { Heading } from "@cogito-app/ui/components/selia/heading";

import { EmptyState } from "@/components/empty-state";
import { CalendarEventItem } from "./calendar-event-item";
import type { CalendarCompetition } from "./calendar-types";

export function CalendarEventsPopup({
  date,
  events,
  position,
  onClose,
  onEventSelect,
}: {
  date: Date;
  events: CalendarCompetition[];
  position: { top: number; left: number };
  onClose: () => void;
  onEventSelect: (event: CalendarCompetition) => void;
}) {
  const popupRef = useRef<HTMLDivElement>(null);
  const [popupRect, setPopupRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        popupRef.current &&
        !popupRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  useEffect(() => {
    if (popupRef.current) {
      setPopupRect(popupRef.current.getBoundingClientRect());
    }
  }, []);

  const adjustedPosition = useMemo(() => {
    const nextPosition = { ...position };
    if (!popupRect) return nextPosition;

    nextPosition.left = Math.min(
      nextPosition.left,
      Math.max(16, window.innerWidth - popupRect.width - 16),
    );
    nextPosition.top = Math.min(
      nextPosition.top,
      Math.max(16, window.innerHeight - popupRect.height - 16),
    );
    return nextPosition;
  }, [position, popupRect]);

  return (
    <div
      ref={popupRef}
      role="dialog"
      aria-label={`Events on ${format(date, "d MMMM yyyy")}`}
      className="fixed z-[1000] max-h-96 w-80 max-w-[calc(100vw-2rem)] overflow-auto rounded-lg bg-popover text-popover-foreground ring ring-popover-border shadow-popover"
      style={{
        left: adjustedPosition.left,
        top: adjustedPosition.top,
      }}
    >
      <div className="sticky top-0 flex items-center justify-between gap-3 border-b border-popover-border bg-popover p-3">
        <Heading size="sm">{format(date, "d MMMM yyyy")}</Heading>
        <Button
          variant="plain"
          size="sm-icon"
          aria-label="Close events"
          onClick={onClose}
        >
          <IconX />
        </Button>
      </div>
      <div className="space-y-2 p-3">
        {events.length === 0 ? (
          <EmptyState
            icon={<IconCalendarEvent />}
            title="No events scheduled"
            description="Nothing is scheduled for this date."
            size="inline"
            className="px-0 py-4"
          />
        ) : (
          events.map((event) => {
            const eventStart = new Date(event.start);
            const eventEnd = new Date(event.end);

            return (
              <CalendarEventItem
                key={event.id}
                event={event}
                view="month"
                isFirstDay={isSameDay(date, eventStart)}
                isLastDay={isSameDay(date, eventEnd)}
                onClick={() => {
                  onEventSelect(event);
                  onClose();
                }}
              />
            );
          })
        )}
      </div>
    </div>
  );
}
