"use client";

import {
  addDays,
  addMonths,
  format,
  isSameMonth,
  startOfMonth,
  subMonths,
} from "date-fns";
import {
  IconArrowLeft,
  IconArrowRight,
  IconCalendarCheck,
  IconChevronDown,
} from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";

import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import {
  Menu,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "@cogito-app/ui/components/selia/menu";
import { cn } from "@cogito-app/ui/lib/utils";

import { CalendarAgendaView } from "./calendar-agenda-view";
import { CalendarDetailsDialog } from "./calendar-details-dialog";
import { CalendarMonthView } from "./calendar-month-view";
import { AGENDA_DAYS_TO_SHOW, EVENT_GAP, EVENT_HEIGHT } from "./calendar-utils";
import type { CalendarCompetition, CalendarView } from "./calendar-types";

const EMPTY_EVENTS: CalendarCompetition[] = [];

export type { CalendarCompetition, CalendarView } from "./calendar-types";

export interface CompetitionCalendarProps {
  events?: CalendarCompetition[];
  className?: string;
  initialView?: CalendarView;
}

export function CompetitionCalendar({
  events = EMPTY_EVENTS,
  className,
  initialView = "month",
}: CompetitionCalendarProps) {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [view, setView] = useState<CalendarView>(initialView);
  const [selectedEvent, setSelectedEvent] =
    useState<CalendarCompetition | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        (event.target instanceof HTMLElement && event.target.isContentEditable)
      ) {
        return;
      }

      if (event.key.toLowerCase() === "m") setView("month");
      if (event.key.toLowerCase() === "a") setView("agenda");
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const sortedEvents = useMemo(
    () =>
      events.toSorted(
        (left, right) => left.start.getTime() - right.start.getTime(),
      ),
    [events],
  );

  const viewTitle = useMemo(() => {
    if (view === "month") return format(currentDate, "MMMM yyyy");

    const end = addDays(currentDate, AGENDA_DAYS_TO_SHOW - 1);
    if (isSameMonth(currentDate, end)) {
      return format(currentDate, "MMMM yyyy");
    }

    return `${format(currentDate, "MMM")} – ${format(end, "MMM yyyy")}`;
  }, [currentDate, view]);

  function handlePrevious() {
    if (view === "month") {
      setCurrentDate((date) => subMonths(date, 1));
      return;
    }

    setCurrentDate((date) => addDays(date, -AGENDA_DAYS_TO_SHOW));
  }

  function handleNext() {
    if (view === "month") {
      setCurrentDate((date) => addMonths(date, 1));
      return;
    }

    setCurrentDate((date) => addDays(date, AGENDA_DAYS_TO_SHOW));
  }

  function handleToday() {
    setCurrentDate(new Date());
  }

  function handleViewChange(value: string) {
    if (value === "month" || value === "agenda") setView(value);
  }

  const calendarStyle = {
    "--event-gap": `${EVENT_GAP}px`,
    "--event-height": `${EVENT_HEIGHT}px`,
  } as CSSProperties;

  return (
    <>
      <Card className={cn("overflow-hidden", className)} style={calendarStyle}>
        <CardHeader className="flex-wrap gap-3 bg-accent/40 p-3 sm:p-4">
          <div className="flex min-w-0 items-center gap-1 sm:gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleToday}
              aria-label="Go to today"
            >
              <IconCalendarCheck />
              <span className="max-[359px]:sr-only">Today</span>
            </Button>
            <div className="flex items-center">
              <Button
                variant="plain"
                size="icon"
                onClick={handlePrevious}
                aria-label={
                  view === "month" ? "Previous month" : "Previous period"
                }
              >
                <IconArrowLeft />
              </Button>
              <Button
                variant="plain"
                size="icon"
                onClick={handleNext}
                aria-label={view === "month" ? "Next month" : "Next period"}
              >
                <IconArrowRight />
              </Button>
            </div>
            <CardTitle className="ml-1 truncate text-sm sm:text-lg">
              {viewTitle}
            </CardTitle>
          </div>

          <Menu>
            <MenuTrigger
              render={
                <Button
                  variant="outline"
                  size="sm"
                  aria-label="Change calendar view"
                />
              }
            >
              <span className="max-[479px]:sr-only">
                {view === "month" ? "Month" : "Agenda"}
              </span>
              <span className="hidden max-[479px]:inline" aria-hidden="true">
                {view === "month" ? "M" : "A"}
              </span>
              <IconChevronDown />
            </MenuTrigger>
            <MenuPopup align="end" size="compact">
              <MenuRadioGroup value={view} onValueChange={handleViewChange}>
                <MenuRadioItem value="month">Month</MenuRadioItem>
                <MenuRadioItem value="agenda">Agenda</MenuRadioItem>
              </MenuRadioGroup>
            </MenuPopup>
          </Menu>
        </CardHeader>

        <CardBody className="p-0!">
          {view === "month" ? (
            <CalendarMonthView
              currentDate={startOfMonth(currentDate)}
              events={sortedEvents}
              onEventSelect={setSelectedEvent}
            />
          ) : (
            <CalendarAgendaView
              currentDate={currentDate}
              events={sortedEvents}
              onEventSelect={setSelectedEvent}
            />
          )}
        </CardBody>
      </Card>

      <CalendarDetailsDialog
        event={selectedEvent}
        open={selectedEvent !== null}
        onClose={() => setSelectedEvent(null)}
      />
    </>
  );
}
