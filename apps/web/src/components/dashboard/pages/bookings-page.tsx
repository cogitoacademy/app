"use client";

import { useMemo } from "react";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import {
  IconCalendarEvent,
  IconInbox,
  IconRefresh,
  IconSearch,
} from "@tabler/icons-react";
import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Button } from "@cogito-app/ui/components/selia/button";
import { Card, CardBody } from "@cogito-app/ui/components/selia/card";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { IconBox } from "@cogito-app/ui/components/selia/icon-box";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import { Text } from "@cogito-app/ui/components/selia/text";
import { cn } from "@cogito-app/ui/lib/utils";

import {
  BookingListCard,
  BookingListCardSkeleton,
  PENDING_BOOKING_STATES,
  type BookingListItem,
} from "@/components/booking/booking-card";
import { EmptyStateCard } from "@/components/empty-state";
import { useRole } from "@/hooks/use-role";
import { getUserFacingError } from "@/lib/error-message";
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

const CANCELLED_STATES = new Set(["cancelled", "late_cancelled"]);

export function BookingsPage() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { tab?: BookingTab };
  const requestedTab = isBookingTab(search.tab) ? search.tab : undefined;
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
  const activeTab =
    requestedTab ??
    getDefaultBookingTab(isRoleLoading ? undefined : role, tabCounts.pending);
  const visibleBookings = useMemo(
    () =>
      getBookingsForTab(bookings, activeTab, now).toSorted((left, right) => {
        const leftTime = new Date(left.scheduledStartAt).getTime();
        const rightTime = new Date(right.scheduledStartAt).getTime();
        return activeTab === "past" || activeTab === "cancelled"
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
    <Stack
      direction="column"
      spacing="lg"
      className="w-full min-w-0 max-w-full overflow-visible"
    >
      <div className="flex w-full min-w-0 max-w-full flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 max-w-full">
          <div className="flex items-center gap-2">
            <Heading size="md">Bookings</Heading>
            {bookingsQuery.isFetching && !bookingsQuery.isPending ? (
              <Badge variant="secondary" pill>
                <IconRefresh className="animate-spin" /> Refreshing
              </Badge>
            ) : null}
          </div>
          <Text className="max-w-full text-muted">{pageDescription}</Text>
        </div>
        {role === "student" ? (
          <Button
            render={<Link to="/tutors" aria-label="Find a tutor" />}
            nativeButton={false}
            className="w-full min-w-0 max-w-full sm:w-auto sm:shrink-0 sm:self-auto"
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
        <Card className="w-full min-w-0 max-w-full">
          <CardBody className="flex min-h-64 flex-col items-center justify-center text-center">
            <IconBox variant="danger-subtle" size="lg" className="mb-4">
              <IconCalendarEvent />
            </IconBox>
            <Heading size="sm">Bookings could not be loaded</Heading>
            <Text className="mt-1 max-w-md text-muted">
              {getUserFacingError(
                bookingsQuery.error,
                "The booking service is temporarily unavailable.",
              )}
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
        <div className="grid min-w-0 max-w-full gap-6">
          {groups.map((group) => (
            <section
              key={group.key}
              aria-labelledby={`booking-group-${group.key}`}
              className="min-w-0 max-w-full"
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
                  <BookingListCard
                    key={booking.id}
                    booking={booking}
                    viewerRole={role}
                    showStatus={shouldShowStatusBadge(
                      booking.currentState,
                      activeTab,
                    )}
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
    <div className="w-full min-w-0 max-w-full overflow-visible pb-1">
      <div className="w-full min-w-0 max-w-full overflow-visible rounded-xl bg-accent/60 p-1 sm:w-fit">
        <div
          data-slot="booking-tab-scroller"
          className="w-full min-w-0 max-w-full overflow-x-auto overflow-y-hidden overscroll-x-contain scrollbar-hidden sm:w-fit"
          role="tablist"
          aria-label="Booking status"
        >
          <div className="flex min-w-max whitespace-nowrap px-1 py-1">
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
      </div>
    </div>
  );
}

function BookingListSkeleton() {
  return (
    <div
      className="grid min-w-0 max-w-full gap-3"
      aria-label="Loading bookings"
    >
      {["booking-skeleton-primary", "booking-skeleton-secondary"].map(
        (placeholder) => (
          <BookingListCardSkeleton key={placeholder} />
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
    const isPending = PENDING_BOOKING_STATES.has(booking.currentState);

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

function getDefaultBookingTab(
  role: string | undefined,
  pendingCount: number,
): BookingTab {
  if (role === "admin") return "all";
  if (role === "tutor" && pendingCount > 0) return "pending";
  return "upcoming";
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

function isBookingTab(value: unknown): value is BookingTab {
  return BOOKING_TABS.some((tab) => tab.value === value);
}
