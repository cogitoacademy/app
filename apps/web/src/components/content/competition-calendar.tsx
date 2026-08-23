"use client";

import {
  addMonths,
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  isWithinInterval,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import {
  IconArrowLeft,
  IconArrowRight,
  IconCalendarEvent,
  IconChevronDown,
  IconExternalLink,
  IconMapPin,
} from "@tabler/icons-react";
import { useMemo, useState } from "react";

import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@cogito-app/ui/components/selia/dialog";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import {
  Menu,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "@cogito-app/ui/components/selia/menu";
import { Text } from "@cogito-app/ui/components/selia/text";
import { cn } from "@cogito-app/ui/lib/utils";

export type CalendarCompetition = {
  id: string;
  title: string;
  description: string | null;
  start: Date;
  end: Date;
  location: string | null;
  categories: Array<{
    name: string;
    coreCategory: string;
  }>;
  educationLevels: string[];
  scale: string | null;
  organizer: string | null;
  registrationDeadline: Date | null;
  registrationLink: string | null;
  socialMediaLink: string | null;
};

type CalendarView = "month" | "agenda";

const categoryStyles: Record<string, string> = {
  mun: "bg-info/15 text-info",
  olimpiade: "bg-danger/15 text-danger",
  wsc: "bg-warning/15 text-warning",
  kti: "bg-primary/15 text-primary",
  debat: "bg-secondary/50 text-secondary-foreground",
  business: "bg-success/15 text-success",
  pidato: "bg-tertiary/15 text-tertiary",
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

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function getCategoryClass(coreCategory: string | undefined) {
  return categoryStyles[coreCategory ?? ""] ?? "bg-primary/15 text-primary";
}

function getCategoryLabel(coreCategory: string) {
  return categoryLabels[coreCategory] ?? coreCategory;
}

function formatCompetitionDates(event: CalendarCompetition) {
  if (isSameDay(event.start, event.end)) {
    return format(event.start, "d MMMM yyyy");
  }

  if (event.start.getFullYear() === event.end.getFullYear()) {
    return `${format(event.start, "d MMM")} – ${format(event.end, "d MMM yyyy")}`;
  }

  return `${format(event.start, "d MMM yyyy")} – ${format(event.end, "d MMM yyyy")}`;
}

function EventPill({
  event,
  onClick,
}: {
  event: CalendarCompetition;
  onClick: () => void;
}) {
  const category = event.categories[0]?.coreCategory;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full truncate rounded-sm px-1.5 py-1 text-left text-xs font-medium transition-opacity hover:opacity-80",
        getCategoryClass(category),
      )}
      title={event.title}
    >
      {event.title}
    </button>
  );
}

function MonthView({
  month,
  events,
  onSelect,
}: {
  month: Date;
  events: CalendarCompetition[];
  onSelect: (event: CalendarCompetition) => void;
}) {
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(month)),
    end: endOfWeek(endOfMonth(month)),
  });

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="grid grid-cols-7 border-b border-border bg-accent/40">
        {weekdayLabels.map((weekday) => (
          <div
            key={weekday}
            className="px-2 py-2 text-center text-xs font-medium text-muted"
          >
            {weekday}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const dayEvents = events.filter((event) =>
            isWithinInterval(day, {
              start: startOfDay(event.start),
              end: endOfDay(event.end),
            }),
          );

          return (
            <div
              key={day.toISOString()}
              className={cn(
                "min-h-28 border-b border-r border-border p-1.5 last:border-r-0 sm:min-h-32",
                !isSameMonth(day, month) && "bg-accent/20 text-dimmed",
              )}
            >
              <div
                className={cn(
                  "mb-1 flex size-6 items-center justify-center rounded-full text-xs",
                  isToday(day) &&
                    "bg-primary font-semibold text-primary-foreground",
                )}
              >
                {format(day, "d")}
              </div>
              <div className="space-y-1">
                {dayEvents.slice(0, 3).map((event) => (
                  <EventPill
                    key={event.id}
                    event={event}
                    onClick={() => onSelect(event)}
                  />
                ))}
                {dayEvents.length > 3 ? (
                  <Text className="px-1 text-xs text-muted">
                    +{dayEvents.length - 3} more
                  </Text>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AgendaView({
  events,
  onSelect,
}: {
  events: CalendarCompetition[];
  onSelect: (event: CalendarCompetition) => void;
}) {
  const today = startOfDay(new Date());
  const upcoming = events.filter((event) => event.end >= today);

  if (upcoming.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
        <IconCalendarEvent className="mx-auto size-8 text-muted" />
        <Heading size="sm" className="mt-3">
          No upcoming competitions
        </Heading>
        <Text className="mt-1 text-muted">
          Published competitions will appear here when they are available.
        </Text>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {upcoming.map((event) => {
        const category = event.categories[0]?.coreCategory;

        return (
          <button
            type="button"
            key={event.id}
            onClick={() => onSelect(event)}
            aria-label={`View details for ${event.title}`}
            className="flex w-full items-start gap-4 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:bg-accent"
          >
            <div className="flex min-w-20 flex-col items-center rounded-md bg-accent px-2 py-2 text-center">
              <span className="text-xs font-medium uppercase text-muted">
                {format(event.start, "MMM")}
              </span>
              <span className="text-2xl font-semibold leading-none">
                {format(event.start, "d")}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap gap-1.5">
                {event.categories.slice(0, 2).map((item) => (
                  <Badge
                    key={`${event.id}-${item.coreCategory}`}
                    variant="secondary"
                    size="sm"
                  >
                    {getCategoryLabel(item.coreCategory)}
                  </Badge>
                ))}
              </div>
              <Heading size="sm" className="mt-2 truncate">
                {event.title}
              </Heading>
              <Text className="mt-1 text-sm text-muted">
                {formatCompetitionDates(event)}
                {event.location ? ` · ${event.location}` : ""}
              </Text>
            </div>
            <span
              className={cn(
                "mt-1 size-2.5 shrink-0 rounded-full",
                getCategoryClass(category),
              )}
              aria-hidden="true"
            />
          </button>
        );
      })}
    </div>
  );
}

function CompetitionDetails({ event }: { event: CalendarCompetition }) {
  return (
    <>
      <DialogHeader className="items-start">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {event.categories.map((category) => (
              <Badge
                key={`${event.id}-${category.coreCategory}`}
                variant="secondary"
                size="sm"
              >
                {getCategoryLabel(category.coreCategory)}
              </Badge>
            ))}
          </div>
          <DialogTitle>{event.title}</DialogTitle>
          <DialogDescription>{formatCompetitionDates(event)}</DialogDescription>
        </div>
      </DialogHeader>
      <DialogBody>
        <div className="space-y-4">
          {event.description ? (
            <Text className="whitespace-pre-line text-muted">
              {event.description}
            </Text>
          ) : null}
          <dl className="grid gap-3 sm:grid-cols-2">
            {event.location ? (
              <div className="flex gap-2">
                <IconMapPin className="mt-0.5 size-4 shrink-0 text-muted" />
                <div>
                  <dt className="text-xs text-muted">Location</dt>
                  <dd className="text-sm">{event.location}</dd>
                </div>
              </div>
            ) : null}
            {event.organizer ? (
              <div>
                <dt className="text-xs text-muted">Organizer</dt>
                <dd className="text-sm">{event.organizer}</dd>
              </div>
            ) : null}
            {event.scale ? (
              <div>
                <dt className="text-xs text-muted">Scale</dt>
                <dd className="text-sm capitalize">{event.scale}</dd>
              </div>
            ) : null}
            {event.registrationDeadline ? (
              <div>
                <dt className="text-xs text-muted">Registration deadline</dt>
                <dd className="text-sm">
                  {format(event.registrationDeadline, "d MMMM yyyy")}
                </dd>
              </div>
            ) : null}
          </dl>
          {event.educationLevels.length > 0 ? (
            <div>
              <Text className="mb-1 text-xs text-muted">Suitable for</Text>
              <div className="flex flex-wrap gap-1.5">
                {event.educationLevels.map((level) => (
                  <Badge key={level} variant="info" size="sm">
                    {educationLevelLabels[level] ?? level}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </DialogBody>
      <DialogFooter>
        <DialogClose>Close</DialogClose>
        {event.socialMediaLink ? (
          <Button
            variant="outline"
            nativeButton={false}
            render={
              <a
                href={event.socialMediaLink}
                target="_blank"
                rel="noreferrer"
                aria-label="Open competition social media"
              />
            }
          >
            Details <IconExternalLink />
          </Button>
        ) : null}
        {event.registrationLink ? (
          <Button
            nativeButton={false}
            render={
              <a
                href={event.registrationLink}
                target="_blank"
                rel="noreferrer"
                aria-label="Register for competition"
              />
            }
          >
            Register <IconExternalLink />
          </Button>
        ) : null}
      </DialogFooter>
    </>
  );
}

export function CompetitionCalendar({
  events,
}: {
  events: CalendarCompetition[];
}) {
  const [view, setView] = useState<CalendarView>("month");
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selectedEvent, setSelectedEvent] =
    useState<CalendarCompetition | null>(null);

  const sortedEvents = useMemo(
    () =>
      events.toSorted(
        (left, right) => left.start.getTime() - right.start.getTime(),
      ),
    [events],
  );

  function goToPrevious() {
    setMonth((current) => subMonths(current, 1));
  }

  function goToNext() {
    setMonth((current) => addMonths(current, 1));
  }

  function goToToday() {
    setMonth(startOfMonth(new Date()));
  }

  return (
    <>
      <Card>
        <CardHeader className="flex-wrap gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              variant="plain"
              size="icon"
              aria-label="Previous month"
              onClick={goToPrevious}
            >
              <IconArrowLeft />
            </Button>
            <Button
              variant="plain"
              size="icon"
              aria-label="Next month"
              onClick={goToNext}
            >
              <IconArrowRight />
            </Button>
            <CardTitle className="ml-1 truncate">
              {format(month, "MMMM yyyy")}
            </CardTitle>
          </div>
          <div className="flex items-center gap-2 sm:ml-auto">
            <Button variant="outline" size="sm" onClick={goToToday}>
              Today
            </Button>
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
                {view === "month" ? "Month" : "Agenda"}
                <IconChevronDown />
              </MenuTrigger>
              <MenuPopup align="end" size="compact">
                <MenuRadioGroup
                  value={view}
                  onValueChange={(value) => setView(value as CalendarView)}
                >
                  <MenuRadioItem value="month">Month</MenuRadioItem>
                  <MenuRadioItem value="agenda">Agenda</MenuRadioItem>
                </MenuRadioGroup>
              </MenuPopup>
            </Menu>
          </div>
        </CardHeader>
        <CardBody>
          {view === "month" ? (
            <MonthView
              month={month}
              events={sortedEvents}
              onSelect={setSelectedEvent}
            />
          ) : (
            <AgendaView events={sortedEvents} onSelect={setSelectedEvent} />
          )}
        </CardBody>
      </Card>

      <Dialog
        open={selectedEvent !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedEvent(null);
        }}
      >
        <DialogPopup className="max-w-2xl">
          {selectedEvent ? <CompetitionDetails event={selectedEvent} /> : null}
        </DialogPopup>
      </Dialog>
    </>
  );
}
