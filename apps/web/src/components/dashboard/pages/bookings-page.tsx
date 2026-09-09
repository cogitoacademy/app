"use client";

import { useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import {
  IconCalendarEvent,
  IconCalendarPlus,
  IconChevronDown,
  IconInbox,
  IconRefresh,
} from "@tabler/icons-react";
import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Button } from "@cogito-app/ui/components/selia/button";
import { Card, CardBody } from "@cogito-app/ui/components/selia/card";
import { Divider } from "@cogito-app/ui/components/selia/divider";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { IconBox } from "@cogito-app/ui/components/selia/icon-box";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import { Text } from "@cogito-app/ui/components/selia/text";
import {
  Select,
  SelectItem,
  SelectList,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@cogito-app/ui/components/selia/select";
import { cn } from "@cogito-app/ui/lib/utils";

import {
  BookingListCard,
  PENDING_BOOKING_STATES,
  TERMINAL_BOOKING_STATES,
  type BookingListItem,
} from "@/components/booking/booking-card";
import { EmptyStateCard } from "@/components/empty-state";
import Loader from "@/components/loader";
import { useRole } from "@/hooks/use-role";
import { getUserFacingError } from "@/lib/error-message";
import { orpc } from "@/utils/orpc";

export const BOOKING_TABS = [
  { value: "action", label: "Needs action" },
  { value: "upcoming", label: "Upcoming" },
  { value: "recurring", label: "Series" },
  { value: "history", label: "History" },
  { value: "all", label: "All" },
] as const;

export type BookingTab = (typeof BOOKING_TABS)[number]["value"];
export type BookingSort = "recommended" | "soonest" | "latest";
const BOOKING_PAGE_SIZE = 20;

export function BookingsPage() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as {
    tab?: BookingTab;
    sort?: BookingSort;
  };
  const requestedTab = isBookingTab(search.tab) ? search.tab : undefined;
  const [optimisticTab, setOptimisticTab] = useState<BookingTab | null>(null);
  const tabNavigationId = useRef(0);
  const activeSort = isBookingSort(search.sort) ? search.sort : "recommended";
  const { role, isLoading: isRoleLoading } = useRole();
  const activeTab =
    optimisticTab ??
    requestedTab ??
    getDefaultBookingTab(isRoleLoading ? undefined : role);
  const bookingsQuery = useInfiniteQuery(
    orpc.booking.listMine.infiniteOptions({
      initialPageParam: null as string | null,
      input: (cursor) => ({
        limit: BOOKING_PAGE_SIZE,
        view: activeTab,
        ...(cursor ? { cursor } : {}),
      }),
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      placeholderData: keepPreviousData,
    }),
  );

  const bookings = useMemo(
    () =>
      (bookingsQuery.data?.pages.flatMap((page) => page.items) ??
        []) as BookingListItem[],
    [bookingsQuery.data?.pages],
  );
  const tabCounts = bookingsQuery.data?.pages[0]?.counts ?? {
    action: 0,
    upcoming: 0,
    recurring: 0,
    history: 0,
    all: 0,
  };
  const visibleBookings = useMemo(
    () => bookings.toSorted(getBookingComparator(activeSort, activeTab)),
    [activeSort, activeTab, bookings],
  );
  const groups = useMemo(
    () => groupBookingsByMonth(visibleBookings),
    [visibleBookings],
  );

  function selectTab(tab: BookingTab) {
    const navigationId = ++tabNavigationId.current;
    setOptimisticTab(tab);
    void navigate({
      to: "/bookings",
      search: (previous) => ({ ...previous, tab }),
    }).finally(() => {
      if (tabNavigationId.current === navigationId) setOptimisticTab(null);
    });
  }

  function selectSort(sort: BookingSort) {
    void navigate({
      to: "/bookings",
      search: (previous) => ({ ...previous, sort }),
    });
  }

  const pageDescription =
    role === "tutor"
      ? "Review requests, upcoming sessions, and your teaching history."
      : role === "admin"
        ? "Monitor every booking and open the detail view for operations."
        : "See your scheduled sessions, invitations, and booking history.";
  const isLoading =
    bookingsQuery.isPending || bookingsQuery.isPlaceholderData || isRoleLoading;
  const hasLoadedPages = (bookingsQuery.data?.pages.length ?? 0) > 0;
  const isInitialError = bookingsQuery.isError && !hasLoadedPages;

  return (
    <Stack
      direction="column"
      spacing="md"
      className="w-full min-w-0 max-w-full overflow-visible"
    >
      <div className="flex w-full min-w-0 max-w-full flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 max-w-full">
          <div className="flex items-center gap-2">
            <Heading level={1} size="md">
              Stay on top of every session
            </Heading>
            {bookingsQuery.isFetching &&
            !bookingsQuery.isPending &&
            !bookingsQuery.isFetchingNextPage ? (
              <Badge variant="secondary" pill>
                <IconRefresh className="animate-spin" /> Refreshing
              </Badge>
            ) : null}
          </div>
          <Text className="max-w-full text-muted">{pageDescription}</Text>
        </div>
        <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-2 sm:w-auto sm:flex-nowrap">
          {role === "student" ? (
            <Button
              render={<Link to="/tutors" aria-label="Find a tutor" />}
              nativeButton={false}
              className="w-fit max-[363.98px]:size-9.5 max-[363.98px]:px-0 sm:w-auto sm:shrink-0"
            >
              <IconCalendarPlus />
              <span className="max-[363.98px]:sr-only">Book a session</span>
            </Button>
          ) : null}
          <div className="max-w-full sm:hidden">
            <BookingSortSelect
              value={activeSort}
              onChange={selectSort}
              triggerClassName="w-40 max-w-full"
            />
          </div>
        </div>
      </div>

      <div className="flex w-full min-w-0 max-w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <BookingTabBar
          activeTab={activeTab}
          counts={tabCounts}
          onChange={selectTab}
        />
        <div className="hidden sm:block">
          <BookingSortSelect value={activeSort} onChange={selectSort} />
        </div>
      </div>

      {isLoading ? (
        <Loader />
      ) : isInitialError ? (
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
          description={
            bookingsQuery.hasNextPage
              ? "No matching bookings in the loaded results yet. Load more to check the rest of your bookings."
              : getEmptyStateDescription(activeTab, role)
          }
          tone={activeTab === "action" ? "warning" : "info"}
          action={
            !bookingsQuery.hasNextPage &&
            role === "student" &&
            activeTab === "upcoming" ? (
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
              <Divider className="mb-3">
                <Heading
                  id={`booking-group-${group.key}`}
                  level={3}
                  size="sm"
                  className="text-muted"
                >
                  {group.label}
                </Heading>
              </Divider>
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

      {!isLoading && hasLoadedPages && bookingsQuery.hasNextPage ? (
        <div className="flex flex-col items-center gap-2">
          {bookingsQuery.isFetchNextPageError ? (
            <Text className="text-center text-danger">
              {getUserFacingError(
                bookingsQuery.error,
                "More bookings could not be loaded. Try again.",
              )}
            </Text>
          ) : null}
          <Button
            variant="underline"
            onClick={() => void bookingsQuery.fetchNextPage()}
            progress={bookingsQuery.isFetchingNextPage}
            disabled={bookingsQuery.isFetchingNextPage}
          >
            Load more bookings
            <IconChevronDown />
          </Button>
        </div>
      ) : null}
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
      <div className="w-full min-[520px]:w-fit min-w-0 max-w-full overflow-hidden rounded-full bg-tabs p-1 inset-shadow-xs inset-shadow-black/10 dark:inset-shadow-none">
        <div
          data-slot="booking-tab-scroller"
          className="w-full min-w-0 max-w-full overflow-x-auto overflow-y-hidden overscroll-x-contain px-1 py-1 scrollbar-hidden"
          role="tablist"
          aria-label="Booking status"
        >
          <div className="flex min-w-max items-center whitespace-nowrap">
            {BOOKING_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.value}
                className={cn(
                  "flex h-8 flex-none cursor-pointer items-center justify-center gap-2.5 rounded-full px-3 py-1 font-medium transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                  activeTab === tab.value
                    ? "bg-tabs-accent text-foreground shadow ring ring-tabs-border inset-shadow-2xs inset-shadow-white/15 dark:inset-shadow-black/15"
                    : "text-muted hover:text-foreground",
                )}
                onClick={() => onChange(tab.value)}
              >
                {tab.label}
                <span className="text-xs text-dimmed">{counts[tab.value]}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function BookingSortSelect({
  value,
  onChange,
  triggerClassName = "w-full sm:w-44",
}: {
  value: BookingSort;
  onChange: (sort: BookingSort) => void;
  triggerClassName?: string;
}) {
  return (
    <Select
      value={value}
      onValueChange={(nextValue) => {
        if (isBookingSort(nextValue)) onChange(nextValue);
      }}
    >
      <SelectTrigger className={triggerClassName} aria-label="Sort bookings">
        <SelectValue />
      </SelectTrigger>
      <SelectPopup>
        <SelectList>
          <SelectItem value="recommended">Recommended</SelectItem>
          <SelectItem value="soonest">Date: soonest</SelectItem>
          <SelectItem value="latest">Date: latest</SelectItem>
        </SelectList>
      </SelectPopup>
    </Select>
  );
}

function getDefaultBookingTab(role: string | undefined): BookingTab {
  if (role === "admin") return "all";
  return "upcoming";
}

function getBookingComparator(sort: BookingSort, tab: BookingTab) {
  return (left: BookingListItem, right: BookingListItem) => {
    const leftTime = new Date(left.scheduledStartAt).getTime();
    const rightTime = new Date(right.scheduledStartAt).getTime();
    if (sort === "soonest") return leftTime - rightTime;
    if (sort === "latest") return rightTime - leftTime;
    const rankDifference =
      getBookingStateRank(left.currentState) -
      getBookingStateRank(right.currentState);
    if (rankDifference !== 0) return rankDifference;
    return tab === "history" ? rightTime - leftTime : leftTime - rightTime;
  };
}

function getBookingStateRank(state: string) {
  if (PENDING_BOOKING_STATES.has(state)) return 0;
  if (TERMINAL_BOOKING_STATES.has(state)) return 2;
  return 1;
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
  if (tab === "all" || tab === "action" || tab === "history") return true;
  return !["confirmed", "scheduled"].includes(state);
}

function getEmptyStateTitle(tab: BookingTab) {
  switch (tab) {
    case "action":
      return "Nothing needs your attention";
    case "upcoming":
      return "No upcoming bookings";
    case "recurring":
      return "No series bookings";
    case "history":
      return "No booking history";
    case "all":
      return "No bookings yet";
  }
}

function getEmptyStateDescription(tab: BookingTab, role: string): ReactNode {
  if (tab === "action") {
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

function isBookingSort(value: unknown): value is BookingSort {
  return ["recommended", "soonest", "latest"].includes(String(value));
}
