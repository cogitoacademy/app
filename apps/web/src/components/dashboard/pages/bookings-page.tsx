"use client";

import { useMemo } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import {
  IconCalendarEvent,
  IconChevronRight,
  IconClock,
  IconInbox,
  IconMapPin,
  IconRefresh,
  IconSearch,
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
import { IconBox } from "@cogito-app/ui/components/selia/icon-box";
import { Stack } from "@cogito-app/ui/components/selia/stack";
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
import { useRole } from "@/hooks/use-role";
import { orpc } from "@/utils/orpc";

export const BOOKING_TABS = [
  { value: "upcoming", label: "Upcoming" },
  { value: "pending", label: "Pending" },
  { value: "recurring", label: "Recurring" },
  { value: "past", label: "Past" },
  { value: "cancelled", label: "Cancelled" },
  { value: "all", label: "All" },
] as const;

export type BookingTab = (typeof BOOKING_TABS)[number]["value"];

type BookingPerson = {
  id: string;
  name: string | null;
  image: string | null;
};

type BookingListItem = {
  id: string;
  type: string;
  modality: string;
  tutorId: string;
  proposerId: string;
  currentState: string;
  targetGroupSize: number;
  confirmedHeadcount: number;
  scheduledStartAt: string | Date;
  scheduledEndAt: string | Date;
  timezone: string;
  originalMarks: number;
  priceSnapshot: { tutorShare?: number } | null;
  tutor: BookingPerson | null;
  proposer: BookingPerson | null;
  participants?: Array<{
    userId: string;
    role: string;
    user: BookingPerson | null;
  }>;
  roomBookings?: Array<{
    status: string;
    room: { name: string; location: string } | null;
  }>;
};

const PENDING_STATES = new Set([
  "awaiting_tutor_review",
  "reschedule_proposed",
  "awaiting_reconfirmation",
  "awaiting_admin_room_approval",
  "awaiting_participant_confirmation",
]);

const CANCELLED_STATES = new Set(["cancelled", "late_cancelled"]);

export function BookingsPage() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { tab?: BookingTab };
  const activeTab = isBookingTab(search.tab) ? search.tab : "upcoming";
  const { role, isLoading: isRoleLoading } = useRole();
  const bookingsQuery = useQuery(
    orpc.booking.listMine.queryOptions({ input: { limit: 100 } }),
  );

  const bookings = useMemo(
    () => (bookingsQuery.data?.items ?? []) as BookingListItem[],
    [bookingsQuery.data?.items],
  );
  const now = Date.now();
  const tabCounts = useMemo(() => getTabCounts(bookings, now), [bookings, now]);
  const visibleBookings = useMemo(
    () =>
      getBookingsForTab(bookings, activeTab, now).toSorted((left, right) => {
        const leftTime = new Date(left.scheduledStartAt).getTime();
        const rightTime = new Date(right.scheduledStartAt).getTime();
        return activeTab === "past" ||
          activeTab === "cancelled" ||
          activeTab === "all"
          ? rightTime - leftTime
          : leftTime - rightTime;
      }),
    [activeTab, bookings, now],
  );
  const groups = useMemo(
    () => groupBookingsByMonth(visibleBookings),
    [visibleBookings],
  );

  function selectTab(tab: BookingTab) {
    void navigate({
      to: "/bookings",
      search: (previous) => ({ ...previous, tab }),
    });
  }

  const pageDescription =
    role === "tutor"
      ? "Review requests, upcoming sessions, and your teaching history."
      : role === "admin"
        ? "Monitor every booking and open the detail view for operations."
        : "See your scheduled sessions, invitations, and booking history.";
  const isLoading = bookingsQuery.isPending || isRoleLoading;

  return (
    <Stack direction="column" spacing="lg" className="min-w-0">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Heading size="md">Bookings</Heading>
            {bookingsQuery.isFetching && !bookingsQuery.isPending ? (
              <Badge variant="secondary" pill>
                <IconRefresh className="animate-spin" /> Refreshing
              </Badge>
            ) : null}
          </div>
          <Text className="text-muted">{pageDescription}</Text>
        </div>
        {role === "student" ? (
          <Button
            render={<Link to="/tutors" aria-label="Find a tutor" />}
            nativeButton={false}
            className="sm:self-auto"
          >
            <IconSearch /> Find a tutor
          </Button>
        ) : null}
      </div>

      <BookingTabBar
        activeTab={activeTab}
        counts={tabCounts}
        onChange={selectTab}
      />

      {isLoading ? (
        <BookingListSkeleton />
      ) : bookingsQuery.isError ? (
        <Card>
          <CardBody className="flex min-h-64 flex-col items-center justify-center text-center">
            <IconBox variant="danger-subtle" size="lg" className="mb-4">
              <IconCalendarEvent />
            </IconBox>
            <Heading size="sm">Bookings could not be loaded</Heading>
            <Text className="mt-1 max-w-md text-muted">
              {bookingsQuery.error instanceof Error
                ? bookingsQuery.error.message
                : "The booking service is temporarily unavailable."}
            </Text>
            <Button
              variant="secondary"
              className="mt-5"
              onClick={() => void bookingsQuery.refetch()}
            >
              Try again
            </Button>
          </CardBody>
        </Card>
      ) : visibleBookings.length === 0 ? (
        <EmptyStateCard
          icon={<IconInbox />}
          title={getEmptyStateTitle(activeTab)}
          description={getEmptyStateDescription(activeTab, role)}
          tone={activeTab === "pending" ? "warning" : "secondary"}
          action={
            role === "student" && activeTab === "upcoming" ? (
              <Button
                render={<Link to="/tutors" aria-label="Browse tutors" />}
                nativeButton={false}
              >
                Browse tutors
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid min-w-0 gap-6">
          {groups.map((group) => (
            <section
              key={group.key}
              aria-labelledby={`booking-group-${group.key}`}
            >
              <Heading
                id={`booking-group-${group.key}`}
                size="sm"
                className="mb-3 text-muted"
              >
                {group.label}
              </Heading>
              <div className="grid min-w-0 gap-3">
                {group.items.map((booking) => (
                  <BookingListRow
                    key={booking.id}
                    booking={booking}
                    activeTab={activeTab}
                    viewerRole={role}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </Stack>
  );
}

function BookingTabBar({
  activeTab,
  counts,
  onChange,
}: {
  activeTab: BookingTab;
  counts: Record<BookingTab, number>;
  onChange: (tab: BookingTab) => void;
}) {
  return (
    <div
      className="-mx-1 overflow-x-auto px-1 pb-1"
      role="tablist"
      aria-label="Booking status"
    >
      <div className="inline-flex min-w-max rounded-xl bg-accent/60 p-1">
        {BOOKING_TABS.map((tab) => {
          const selected = activeTab === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={selected}
              className={cn(
                "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                selected
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted hover:bg-background/70 hover:text-foreground",
              )}
              onClick={() => onChange(tab.value)}
            >
              {tab.label}
              <span className="ml-1.5 text-xs text-dimmed">
                {counts[tab.value]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BookingListRow({
  booking,
  activeTab,
  viewerRole,
}: {
  booking: BookingListItem;
  activeTab: BookingTab;
  viewerRole: string;
}) {
  const date = getDateParts(booking.scheduledStartAt, booking.timezone);
  const people = getBookingPeople(booking);
  const title = getBookingTitle(booking, viewerRole);
  const location = getBookingLocation(booking);
  const showStatus = shouldShowStatusBadge(booking.currentState, activeTab);
  const attention = PENDING_STATES.has(booking.currentState);
  const actionLabel =
    booking.currentState === "awaiting_tutor_review"
      ? "Review request"
      : booking.currentState === "reschedule_proposed"
        ? "Review reschedule"
        : "Details";

  return (
    <Card
      data-slot="booking-row"
      className={cn(
        "overflow-hidden transition-shadow hover:shadow-card",
        attention && "border-warning-border",
      )}
    >
      <div className="grid min-w-0 gap-4 p-4 md:grid-cols-[5.5rem_minmax(10rem,0.8fr)_minmax(0,1.5fr)_minmax(10rem,0.8fr)_auto] md:items-center md:gap-5 md:p-5">
        <div className="flex min-w-0 items-center gap-3 md:block">
          <DateTile date={date} />
          <div className="min-w-0 md:hidden">
            {showStatus ? (
              <Badge
                variant={getBookingStateVariant(booking.currentState)}
                pill
                className="mb-1"
              >
                {getBookingStateLabel(booking.currentState)}
              </Badge>
            ) : null}
            <BookingMeta booking={booking} location={location} />
          </div>
        </div>

        <div className="hidden min-w-0 md:block">
          <BookingMeta booking={booking} location={location} />
        </div>

        <div className="min-w-0">
          <Text className="truncate font-semibold" title={title}>
            {title}
          </Text>
          <Text className="mt-1 truncate text-sm text-muted">
            {getBookingTypeLabel(booking.type)} ·{" "}
            {getRelatedPeopleLabel(people)}
          </Text>
          <AvatarStack people={people} />
        </div>

        <div className="flex min-w-0 items-center justify-between gap-3 md:block">
          <div className="min-w-0">
            <Text className="truncate text-sm font-medium">
              {getFinancialLabel(booking, viewerRole)}
            </Text>
            <Text className="mt-1 truncate text-xs text-muted">
              {getBookingStateDescription(booking.currentState)}
            </Text>
          </div>
          {showStatus ? (
            <Badge
              variant={getBookingStateVariant(booking.currentState)}
              pill
              className="hidden shrink-0 md:inline-flex"
            >
              {getBookingStateLabel(booking.currentState)}
            </Badge>
          ) : null}
        </div>

        <Button
          variant={attention ? "primary" : "secondary"}
          size="sm"
          className="w-full md:w-auto"
          render={
            <Link
              to="/bookings/$bookingId"
              params={{ bookingId: booking.id }}
              aria-label={`${actionLabel}: ${title}`}
            />
          }
          nativeButton={false}
        >
          {actionLabel}
          <IconChevronRight />
        </Button>
      </div>
    </Card>
  );
}

function BookingMeta({
  booking,
  location,
}: {
  booking: BookingListItem;
  location: string;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <div className="flex items-center gap-1.5 text-sm font-medium">
        <IconClock className="size-3.5 shrink-0 text-muted" />
        <span className="truncate">
          {formatBookingTimeRange(
            booking.scheduledStartAt,
            booking.scheduledEndAt,
            booking.timezone,
          )}
        </span>
      </div>
      <div className="flex items-center gap-1.5 text-sm text-muted">
        <IconMapPin className="size-3.5 shrink-0" />
        <span className="truncate">{location}</span>
      </div>
    </div>
  );
}

function DateTile({ date }: { date: ReturnType<typeof getDateParts> }) {
  return (
    <div
      className={cn(
        "flex size-16 shrink-0 flex-col items-center justify-center rounded-xl text-center",
        date.isToday
          ? "bg-primary text-primary-foreground"
          : "bg-accent text-foreground",
      )}
    >
      <span className="text-xs font-medium uppercase opacity-80">
        {date.weekday}
      </span>
      <span className="text-2xl font-semibold leading-none">{date.day}</span>
      <span className="text-[0.65rem] font-medium uppercase opacity-80">
        {date.month}
      </span>
    </div>
  );
}

function AvatarStack({ people }: { people: BookingPerson[] }) {
  if (people.length === 0) return null;

  return (
    <div
      className="mt-3 flex items-center -space-x-2"
      aria-label="Participants"
    >
      {people.slice(0, 4).map((person) => (
        <Avatar key={person.id} size="sm" className="border-2 border-card">
          {person.image ? <AvatarImage src={person.image} alt="" /> : null}
          <AvatarFallback>{getInitials(person.name)}</AvatarFallback>
        </Avatar>
      ))}
      {people.length > 4 ? (
        <span className="ml-3 text-xs text-muted">+{people.length - 4}</span>
      ) : null}
    </div>
  );
}

function BookingListSkeleton() {
  return (
    <div className="grid gap-3" aria-label="Loading bookings">
      {["booking-skeleton-primary", "booking-skeleton-secondary"].map(
        (placeholder) => (
          <Card key={placeholder} className="animate-pulse">
            <CardBody className="flex gap-4 p-5">
              <div className="size-16 shrink-0 rounded-xl bg-accent" />
              <div className="min-w-0 flex-1 space-y-3">
                <div className="h-4 w-1/3 rounded bg-accent" />
                <div className="h-3 w-2/3 rounded bg-accent" />
                <div className="h-3 w-1/2 rounded bg-accent" />
              </div>
            </CardBody>
          </Card>
        ),
      )}
    </div>
  );
}

function getBookingsForTab(
  bookings: BookingListItem[],
  tab: BookingTab,
  now: number,
) {
  return bookings.filter((booking) => {
    const isFuture = new Date(booking.scheduledEndAt).getTime() >= now;
    const isCancelled = CANCELLED_STATES.has(booking.currentState);
    const isPending = PENDING_STATES.has(booking.currentState);

    switch (tab) {
      case "upcoming":
        return isFuture && !isCancelled && !isPending;
      case "pending":
        return isPending;
      case "recurring":
        return booking.type === "series" && !isCancelled;
      case "past":
        return !isFuture && !isCancelled;
      case "cancelled":
        return isCancelled;
      case "all":
        return true;
    }
  });
}

function getTabCounts(bookings: BookingListItem[], now: number) {
  return Object.fromEntries(
    BOOKING_TABS.map(({ value }) => [
      value,
      getBookingsForTab(bookings, value, now).length,
    ]),
  ) as Record<BookingTab, number>;
}

function groupBookingsByMonth(bookings: BookingListItem[]) {
  const groups = new Map<
    string,
    { key: string; label: string; items: BookingListItem[] }
  >();

  for (const booking of bookings) {
    const date = new Date(booking.scheduledStartAt);
    const key = new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      timeZone: booking.timezone,
    }).format(date);
    const label = new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "long",
      timeZone: booking.timezone,
    }).format(date);
    const group = groups.get(key) ?? { key, label, items: [] };
    group.items.push(booking);
    groups.set(key, group);
  }

  return [...groups.values()];
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

function getBookingPeople(booking: BookingListItem) {
  const people = [
    booking.tutor,
    booking.proposer,
    ...(booking.participants ?? []).map((participant) => participant.user),
  ].filter((person): person is BookingPerson => Boolean(person));
  return [...new Map(people.map((person) => [person.id, person])).values()];
}

function getBookingTitle(booking: BookingListItem, viewerRole: string) {
  const tutorName = booking.tutor?.name ?? "Cogito tutor";
  const proposerName = booking.proposer?.name ?? "Cogito student";
  if (viewerRole === "tutor") return `Session with ${proposerName}`;
  if (viewerRole === "admin") return `${proposerName} · ${tutorName}`;
  return `Session with ${tutorName}`;
}

function getRelatedPeopleLabel(people: BookingPerson[]) {
  if (people.length === 0) return "No participants listed";
  const names = people
    .map((person) => person.name?.trim() || "Participant")
    .slice(0, 2);
  return people.length > 2
    ? `${names.join(", ")} +${people.length - 2}`
    : names.join(", ");
}

function getBookingLocation(booking: BookingListItem) {
  if (booking.modality === "online") return "Online";
  const room = booking.roomBookings?.find(
    (roomBooking) => roomBooking.status !== "cancelled",
  )?.room;
  return room ? `${room.name} · ${room.location}` : "Offline venue pending";
}

function getFinancialLabel(booking: BookingListItem, viewerRole: string) {
  const total = `${booking.originalMarks} Marks`;
  const tutorShare = `${booking.priceSnapshot?.tutorShare ?? 0} Marks`;
  if (viewerRole === "tutor") return `Earns ${tutorShare} · Total ${total}`;
  if (viewerRole === "admin") return `Total ${total} · Tutor ${tutorShare}`;
  return `You pay ${total}`;
}

function shouldShowStatusBadge(state: string, tab: BookingTab) {
  if (tab === "all" || tab === "pending" || tab === "cancelled") return true;
  return !["confirmed", "scheduled"].includes(state);
}

function getEmptyStateTitle(tab: BookingTab) {
  switch (tab) {
    case "upcoming":
      return "No upcoming bookings";
    case "pending":
      return "Nothing needs your attention";
    case "recurring":
      return "No recurring bookings";
    case "past":
      return "No past bookings";
    case "cancelled":
      return "No cancelled bookings";
    case "all":
      return "No bookings yet";
  }
}

function getEmptyStateDescription(tab: BookingTab, role: string): ReactNode {
  if (tab === "pending") {
    return role === "tutor"
      ? "New student requests and reschedule decisions will appear here."
      : "Requests, confirmations, and reschedule proposals will appear here.";
  }
  if (role === "admin") return "Bookings will appear here as they are created.";
  return "Book a session with a tutor and it will appear here.";
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

function isBookingTab(value: unknown): value is BookingTab {
  return BOOKING_TABS.some((tab) => tab.value === value);
}
