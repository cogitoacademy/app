"use client";

import { Link } from "@tanstack/react-router";
import {
  IconChalkboardTeacher,
  IconChevronRight,
  IconClock,
  IconMapPin,
  IconCalendarEvent,
  IconArrowRight,
  IconInbox,
} from "@tabler/icons-react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@cogito-app/ui/components/selia/avatar";
import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Button } from "@cogito-app/ui/components/selia/button";
import { Card, CardBody } from "@cogito-app/ui/components/selia/card";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { Separator } from "@cogito-app/ui/components/selia/separator";
import { Text } from "@cogito-app/ui/components/selia/text";
import { cn } from "@cogito-app/ui/lib/utils";

import {
  formatBookingTimeRange,
  getBookingStateDescription,
  getBookingStateLabel,
  getBookingStateVariant,
  getBookingTypeLabel,
} from "@/components/booking/booking-ui";
import { EmptyStateCard } from "@/components/empty-state";

export type BookingCardPerson = {
  id: string;
  name: string | null;
  image: string | null;
};

export type BookingCardData = {
  id: string;
  type: string;
  modality: string;
  currentState: string;
  scheduledStartAt: string | Date;
  scheduledEndAt: string | Date;
  timezone: string;
  originalMarks: number;
  priceSnapshot: { perStudent?: number; tutorShare?: number } | null;
  tutor: BookingCardPerson | null;
  proposer: BookingCardPerson | null;
  participants?: Array<{
    userId: string;
    role: string;
    user: BookingCardPerson | null;
  }>;
  roomBookings?: Array<{
    status: string;
    room: { name: string; location: string } | null;
  }>;
};

export type BookingListItem = BookingCardData;

export const PENDING_BOOKING_STATES = new Set([
  "awaiting_tutor_review",
  "reschedule_proposed",
  "awaiting_reconfirmation",
  "awaiting_admin_room_approval",
  "awaiting_participant_confirmation",
]);

export const TERMINAL_BOOKING_STATES = new Set([
  "completed",
  "cancelled",
  "late_cancelled",
  "declined",
  "no_show",
  "expired",
]);

export function isUpcomingBooking(booking: BookingCardData, now = Date.now()) {
  return (
    new Date(booking.scheduledEndAt).getTime() >= now &&
    !TERMINAL_BOOKING_STATES.has(booking.currentState) &&
    !PENDING_BOOKING_STATES.has(booking.currentState)
  );
}

export function BookingListCard({
  booking,
  viewerRole,
  showStatus = true,
  actionLabel,
  className,
}: {
  booking: BookingCardData;
  viewerRole: string;
  showStatus?: boolean;
  actionLabel?: string;
  className?: string;
}) {
  const date = getDateParts(booking.scheduledStartAt, booking.timezone);
  const people = getBookingPeople(booking);
  const title = getBookingTitle(booking);
  const location = getBookingLocation(booking);
  const attention = PENDING_BOOKING_STATES.has(booking.currentState);
  const resolvedActionLabel =
    actionLabel ??
    (booking.currentState === "awaiting_tutor_review"
      ? "Review request"
      : booking.currentState === "reschedule_proposed"
        ? "Review reschedule"
        : "Details");

  return (
    <Card
      data-slot="booking-row"
      className={cn(
        "overflow-visible transition-shadow hover:shadow-card",
        attention && "border-warning-border",
        className,
      )}
    >
      <div className="grid min-w-0 gap-4 p-4 md:grid-cols-[5.5rem_auto_minmax(0,1fr)_auto] md:items-center md:gap-5 md:p-5">
        <div className="flex min-w-0 items-center gap-3 md:gap-0">
          <DateTile date={date} />
          <div className="min-w-0 md:hidden">
            <BookingMeta booking={booking} location={location} />
          </div>
        </div>

        <div className="hidden min-w-0 md:block md:w-auto">
          <BookingMeta booking={booking} location={location} />
        </div>

        <div className="min-w-0">
          <Text className="truncate font-semibold md:text-lg" title={title}>
            {title}
          </Text>
          <div className="mt-3 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
            <AvatarStack people={people} />
            <Separator orientation="vertical" className="h-full" />
            <BookingFinancialInfo booking={booking} viewerRole={viewerRole} />
            {showStatus ? (
              <BookingStatusBadge
                bookingId={booking.id}
                state={booking.currentState}
              />
            ) : null}
          </div>
        </div>

        <Button
          variant={attention ? "primary" : "secondary"}
          size="sm"
          className="w-full md:w-auto md:justify-self-end"
          render={
            <Link
              to="/bookings/$bookingId"
              params={{ bookingId: booking.id }}
              aria-label={`${resolvedActionLabel}: ${title}`}
            />
          }
          nativeButton={false}
        >
          {resolvedActionLabel}
          <IconChevronRight />
        </Button>
      </div>
    </Card>
  );
}

export function BookingListCardSkeleton({ className }: { className?: string }) {
  return (
    <Card className={cn("animate-pulse", className)}>
      <CardBody className="flex gap-4 p-5">
        <div className="size-16 shrink-0 rounded-xl bg-accent" />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="h-4 w-1/3 rounded bg-accent" />
          <div className="h-3 w-2/3 rounded bg-accent" />
          <div className="h-3 w-1/2 rounded bg-accent" />
        </div>
      </CardBody>
    </Card>
  );
}

export function NextLessonSection({
  booking,
  isLoading,
  viewerRole,
}: {
  booking: BookingCardData | undefined;
  isLoading: boolean;
  viewerRole: "student" | "tutor";
}) {
  const headingId = `next-lesson-heading-${viewerRole}`;
  const isStudent = viewerRole === "student";

  return (
    <section
      aria-labelledby={headingId}
      className="min-w-0"
      data-slot="next-lesson-section"
    >
      <div className="mb-3 flex items-end justify-between gap-4">
        <div>
          <Heading id={headingId} level={2} size="sm">
            Next lesson
          </Heading>
          <Text className="mt-1 text-sm text-muted">
            {isStudent
              ? "Your nearest scheduled learning session."
              : "Your nearest scheduled teaching session."}
          </Text>
        </div>
        <Button
          variant="plain"
          size="sm"
          className="shrink-0"
          nativeButton={false}
          render={<Link to="/bookings" aria-label="View all bookings" />}
        >
          View all <IconArrowRight />
        </Button>
      </div>

      {isLoading ? (
        <BookingListCardSkeleton />
      ) : booking ? (
        <BookingListCard
          booking={booking}
          viewerRole={viewerRole}
          actionLabel="View lesson"
        />
      ) : (
        <EmptyStateCard
          icon={isStudent ? <IconCalendarEvent /> : <IconInbox />}
          title="No lesson scheduled yet"
          description={
            isStudent
              ? "Book a tutor session and your next lesson will appear here."
              : "Confirmed teaching sessions will appear here."
          }
          tone="secondary"
          size="compact"
          action={
            isStudent ? (
              <Button
                variant="secondary"
                nativeButton={false}
                render={<Link to="/tutors" aria-label="Browse tutors" />}
              >
                Browse tutors
              </Button>
            ) : undefined
          }
        />
      )}
    </section>
  );
}

function BookingMeta({
  booking,
  location,
}: {
  booking: BookingCardData;
  location: string;
}) {
  const tutorName = booking.tutor?.name?.trim() || "Cogito tutor";

  return (
    <div className="min-w-0 space-y-1 md:w-auto md:max-w-48">
      <div className="flex items-center gap-1.5 text-sm font-medium">
        <IconClock className="size-3.5 shrink-0 text-muted md:size-5" />
        <span className="truncate">
          {formatBookingTimeRange(
            booking.scheduledStartAt,
            booking.scheduledEndAt,
            booking.timezone,
          )}
        </span>
      </div>
      <div className="flex items-center gap-1.5 text-sm text-muted">
        <IconMapPin className="size-3.5 shrink-0 md:size-5" />
        <span className="truncate">{location}</span>
      </div>
      <div className="flex items-center gap-1.5 text-sm text-muted">
        <IconChalkboardTeacher className="size-3.5 shrink-0 md:size-5" />
        <span className="truncate" title={tutorName}>
          {tutorName}
        </span>
      </div>
    </div>
  );
}

function DateTile({ date }: { date: ReturnType<typeof getDateParts> }) {
  return (
    <div
      className={cn(
        "flex aspect-square size-16 shrink-0 flex-col items-center justify-center rounded-md text-center md:h-full md:w-auto md:flex-1",
        date.isToday
          ? "bg-primary text-primary-foreground"
          : "bg-accent text-foreground",
      )}
    >
      <span className="text-xs font-medium uppercase opacity-80 lg:text-sm">
        {date.weekday}
      </span>
      <span className="my-1 text-2xl font-semibold leading-none lg:text-4xl">
        {date.day}
      </span>
      <span className="text-[0.65rem] font-medium uppercase opacity-80 lg:text-sm">
        {date.month}
      </span>
    </div>
  );
}

function AvatarStack({ people }: { people: BookingCardPerson[] }) {
  if (people.length === 0) return null;

  return (
    <div className="flex items-center -space-x-2" aria-label="Participants">
      {people.map((person) => (
        <Avatar key={person.id} size="sm" className="border-2 border-card">
          {person.image ? <AvatarImage src={person.image} alt="" /> : null}
          <AvatarFallback>{getInitials(person.name)}</AvatarFallback>
        </Avatar>
      ))}
    </div>
  );
}

function getBookingPeople(booking: BookingCardData) {
  const people = [
    booking.proposer,
    ...(booking.participants ?? [])
      .filter((participant) => participant.role !== "tutor")
      .map((participant) => participant.user),
  ].filter((person): person is BookingCardPerson => Boolean(person));
  return [...new Map(people.map((person) => [person.id, person])).values()];
}

function getBookingTitle(booking: BookingCardData) {
  const participantNames = getBookingPeople(booking).map(
    (person) => person.name?.trim() || "Participant",
  );
  const participantLabel = formatPeopleNames(participantNames);
  return `${getBookingTypeLabel(booking.type)} with ${participantLabel}`;
}

function formatPeopleNames(names: string[]) {
  if (names.length === 0) return "participant";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names[0]}, ${names[1]} +${names.length - 2}`;
}

function getBookingLocation(booking: BookingCardData) {
  if (booking.modality === "online") return "Online";
  const room = booking.roomBookings?.find(
    (roomBooking) => roomBooking.status !== "cancelled",
  )?.room;
  return room ? `${room.name} · ${room.location}` : "Offline venue pending";
}

function BookingFinancialInfo({
  booking,
  viewerRole,
}: {
  booking: BookingCardData;
  viewerRole: string;
}) {
  const total = booking.originalMarks;
  const tutorShare = booking.priceSnapshot?.tutorShare ?? 0;
  const studentPay =
    booking.type === "group"
      ? (booking.priceSnapshot?.perStudent ?? total)
      : total;

  if (viewerRole === "tutor") {
    return (
      <div className="inline-flex flex-wrap items-center gap-1.5 text-sm font-medium">
        <FinancialValue label="Earns" value={tutorShare} />
        <span className="text-dimmed" aria-hidden="true">
          ·
        </span>
        <FinancialValue label="Total" value={total} />
      </div>
    );
  }

  if (viewerRole === "admin") {
    return (
      <div className="inline-flex flex-wrap items-center gap-1.5 text-sm font-medium">
        <FinancialValue label="Total" value={total} />
        <span className="text-dimmed" aria-hidden="true">
          ·
        </span>
        <FinancialValue label="Tutor" value={tutorShare} />
      </div>
    );
  }

  return <FinancialValue label="You pay" value={studentPay} />;
}

function FinancialValue({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="text-muted">{label}</span>
      <MarkAmount value={value} />
    </span>
  );
}

function MarkAmount({ value }: { value: number }) {
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap"
      aria-label={`${value} Marks`}
    >
      <img
        src="/cogito-mark.png"
        alt=""
        aria-hidden="true"
        className="size-4 shrink-0 object-contain"
      />
      <span>{value}</span>
    </span>
  );
}

function BookingStatusBadge({
  bookingId,
  state,
}: {
  bookingId: string;
  state: string;
}) {
  const tooltipId = `booking-status-${bookingId}`;
  return (
    <span className="group relative inline-flex shrink-0">
      <Badge
        variant={getBookingStateVariant(state)}
        pill
        tabIndex={0}
        aria-describedby={tooltipId}
      >
        {getBookingStateLabel(state)}
      </Badge>
      <span
        id={tooltipId}
        role="tooltip"
        className="pointer-events-none invisible absolute bottom-full left-1/2 z-20 mb-2 w-max max-w-56 -translate-x-1/2 rounded-lg border border-popover-border bg-popover px-3 py-2 text-xs text-popover-foreground opacity-0 shadow-popover transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
      >
        {getBookingStateDescription(state)}
      </span>
    </span>
  );
}

function getDateParts(value: string | Date, timeZone: string) {
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone,
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const dateKey = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).format(date);
  const todayKey = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).format(new Date());

  return {
    weekday: get("weekday"),
    day: get("day"),
    month: get("month"),
    isToday: dateKey === todayKey,
  };
}

function getInitials(name: string | null) {
  const initials = name
    ?.trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return initials || "CG";
}
