"use client";

import * as React from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import {
  IconBell,
  IconExternalLink,
  IconMail,
  IconMailOpened,
} from "@tabler/icons-react";
import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Card,
  CardBody,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import { Checkbox } from "@cogito-app/ui/components/selia/checkbox";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { IconBox } from "@cogito-app/ui/components/selia/icon-box";
import {
  Item,
  ItemAction,
  ItemContent,
  ItemDescription,
  ItemMeta,
  ItemTitle,
} from "@cogito-app/ui/components/selia/item";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import { Text } from "@cogito-app/ui/components/selia/text";
import { toastManager } from "@cogito-app/ui/components/selia/toast";
import { cn } from "@cogito-app/ui/lib/utils";

import { EmptyStateCard } from "@/components/empty-state";
import { orpc } from "@/utils/orpc";

const PAGE_SIZE = 20;

type NotificationItemData = {
  id: string;
  bookingId: string | null;
  category: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: Date | string;
};

const CATEGORY_LABELS: Record<string, string> = {
  achievement: "Achievement",
  booking: "Booking",
  override: "Admin update",
  payment: "Payment",
  refund: "Refund",
  schedule: "Schedule",
  system: "System",
};

function toDate(value: Date | string) {
  return typeof value === "string" ? new Date(value) : value;
}

function formatNotificationDate(date: Date | string) {
  return format(toDate(date), "d MMM yyyy 'at' h:mm a");
}

function formatRelativeTime(date: Date | string) {
  const value = toDate(date);
  const diff = Date.now() - value.getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return "Older update";
}

function getCategoryLabel(category: string) {
  return CATEGORY_LABELS[category] ?? category.replaceAll("_", " ");
}

function getCategoryVariant(category: string) {
  if (category === "payment" || category === "refund") {
    return "success" as const;
  }
  if (category === "override" || category === "system") {
    return "warning" as const;
  }
  if (category === "booking" || category === "schedule") {
    return "info" as const;
  }
  return "secondary" as const;
}

export function NotificationsPage() {
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(
    () => new Set(),
  );
  const notificationsQuery = useInfiniteQuery(
    orpc.notification.list.infiniteOptions({
      initialPageParam: null as string | null,
      input: (cursor) => ({
        limit: PAGE_SIZE,
        ...(cursor ? { cursor } : {}),
      }),
      getNextPageParam: (lastPage) => lastPage.nextCursor,
    }),
  );
  const unreadQuery = useQuery(
    orpc.notification.getUnreadCount.queryOptions({}),
  );

  const updateReadStatus = useMutation(
    orpc.notification.updateReadStatus.mutationOptions({
      onSuccess: (_result, variables) => {
        setSelectedIds(new Set());
        void invalidateNotificationQueries(queryClient);
        toastManager.add({
          title: variables.isRead
            ? "Notifications marked as read"
            : "Notifications marked as unread",
          type: "success",
        });
      },
      onError: (error: Error) =>
        toastManager.add({
          title: "Notification status could not be updated",
          description: error.message,
          type: "error",
        }),
    }),
  );

  const markAllAsRead = useMutation(
    orpc.notification.markAllAsRead.mutationOptions({
      onSuccess: () => {
        setSelectedIds(new Set());
        void invalidateNotificationQueries(queryClient);
        toastManager.add({
          title: "All notifications marked as read",
          type: "success",
        });
      },
      onError: (error: Error) =>
        toastManager.add({
          title: "Notifications could not be updated",
          description: error.message,
          type: "error",
        }),
    }),
  );

  const items =
    (notificationsQuery.data?.pages.flatMap(
      (page) => page.items,
    ) as NotificationItemData[]) ?? [];
  const unreadCount =
    unreadQuery.data?.count ?? items.filter((item) => !item.isRead).length;
  const selectedCount = selectedIds.size;
  const allSelected =
    items.length > 0 && items.every((item) => selectedIds.has(item.id));
  const someSelected = selectedCount > 0 && !allSelected;

  function toggleAll() {
    setSelectedIds(
      allSelected ? new Set() : new Set(items.map((item) => item.id)),
    );
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function updateSelected(isRead: boolean) {
    if (selectedIds.size === 0) return;
    updateReadStatus.mutate({
      ids: Array.from(selectedIds),
      isRead,
    });
  }

  return (
    <Stack direction="column" spacing="lg">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Heading size="md">Notifications</Heading>
            {unreadCount > 0 ? (
              <Badge variant="info" pill>
                {unreadCount} unread
              </Badge>
            ) : null}
          </div>
          <Text className="text-muted">
            Review updates from your bookings, payments, and account.
          </Text>
        </div>
        {unreadCount > 0 ? (
          <Button
            variant="outline"
            onClick={() => markAllAsRead.mutate({})}
            progress={markAllAsRead.isPending}
            disabled={markAllAsRead.isPending}
          >
            <IconMailOpened /> Mark all as read
          </Button>
        ) : null}
      </div>

      {notificationsQuery.isPending ? (
        <NotificationsLoading />
      ) : notificationsQuery.isError ? (
        <Card>
          <CardBody className="flex min-h-64 flex-col items-center justify-center text-center">
            <IconBox variant="danger-subtle" size="lg" className="mb-4">
              <IconBell />
            </IconBox>
            <Heading size="sm">Notifications could not be loaded</Heading>
            <Text className="mt-2 max-w-md text-muted">
              {notificationsQuery.error instanceof Error
                ? notificationsQuery.error.message
                : "The notification service is temporarily unavailable."}
            </Text>
            <Button
              variant="secondary"
              className="mt-5"
              onClick={() => void notificationsQuery.refetch()}
            >
              Try again
            </Button>
          </CardBody>
        </Card>
      ) : items.length === 0 ? (
        <EmptyStateCard
          icon={<IconBell />}
          title="You are all caught up"
          description="New booking and account updates will appear here."
          tone="success"
        />
      ) : (
        <Card>
          <CardHeader className="p-5 sm:p-6">
            <CardTitle>All activity</CardTitle>
            <CardDescription>
              Newest updates appear first. Select rows to change their read
              status.
            </CardDescription>
          </CardHeader>

          <div className="flex flex-col gap-3 border-b border-card-separator px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 md:min-h-[53px]">
            <div className="flex items-center gap-2.5">
              <Checkbox
                checked={allSelected}
                indeterminate={someSelected}
                onCheckedChange={toggleAll}
                aria-label={
                  allSelected ? "Clear selection" : "Select all notifications"
                }
              />
              <span className="text-sm font-medium">
                {selectedCount > 0 ? `${selectedCount} selected` : "Select all"}
              </span>
            </div>

            {selectedCount > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => updateSelected(true)}
                  progress={
                    updateReadStatus.isPending &&
                    updateReadStatus.variables?.isRead === true
                  }
                  disabled={updateReadStatus.isPending}
                >
                  <IconMailOpened /> Mark as read
                </Button>
                <Button
                  variant="plain"
                  size="xs"
                  onClick={() => updateSelected(false)}
                  progress={
                    updateReadStatus.isPending &&
                    updateReadStatus.variables?.isRead === false
                  }
                  disabled={updateReadStatus.isPending}
                >
                  <IconMail /> Mark as unread
                </Button>
              </div>
            ) : (
              <span className="text-sm text-dimmed">
                Select any row to manage its read status.
              </span>
            )}
          </div>

          <CardBody className="p-0!">
            <div aria-label="Notification list" role="list">
              {items.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  selected={selectedIds.has(notification.id)}
                  isPending={
                    updateReadStatus.isPending &&
                    updateReadStatus.variables?.ids.includes(
                      notification.id,
                    ) === true
                  }
                  onToggleSelected={() => toggleSelected(notification.id)}
                  onUpdateReadStatus={(isRead) =>
                    updateReadStatus.mutate({
                      ids: [notification.id],
                      isRead,
                    })
                  }
                />
              ))}
            </div>
          </CardBody>
          {notificationsQuery.hasNextPage ? (
            <CardFooter className="justify-center">
              <Button
                variant="outline"
                onClick={() => void notificationsQuery.fetchNextPage()}
                progress={notificationsQuery.isFetchingNextPage}
                disabled={notificationsQuery.isFetchingNextPage}
              >
                Load older notifications
              </Button>
            </CardFooter>
          ) : null}
        </Card>
      )}
    </Stack>
  );
}

function NotificationItem({
  notification,
  selected,
  isPending,
  onToggleSelected,
  onUpdateReadStatus,
}: {
  notification: NotificationItemData;
  selected: boolean;
  isPending: boolean;
  onToggleSelected: () => void;
  onUpdateReadStatus: (isRead: boolean) => void;
}) {
  const date = toDate(notification.createdAt);
  const dateTime = date.toISOString();

  return (
    <Item
      variant="plain"
      size="md"
      role="listitem"
      className={cn(
        "items-start rounded-none border-b border-separator px-5 py-4 last:border-b-0 sm:px-6",
        !notification.isRead && "bg-info/5",
        selected && "bg-accent",
      )}
    >
      <div className="pt-0.5">
        <Checkbox
          checked={selected}
          onCheckedChange={onToggleSelected}
          aria-label={`Select ${notification.title}`}
        />
      </div>
      <ItemContent className="min-w-0 gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <ItemTitle
            className={cn("min-w-0", !notification.isRead && "font-semibold")}
          >
            {notification.title}
          </ItemTitle>
          <ItemDescription className="max-w-3xl text-sm">
            {notification.body}
          </ItemDescription>
          {!notification.isRead ? (
            <span
              className="size-1.5 rounded-full bg-info"
              aria-label="Unread"
              title="Unread"
            />
          ) : null}
        </div>

        <ItemMeta className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <time
            dateTime={dateTime}
            className="inline-flex items-center gap-1"
            title={formatNotificationDate(notification.createdAt)}
          >
            {formatNotificationDate(notification.createdAt)}
          </time>
          <span aria-hidden="true">·</span>
          <span>{formatRelativeTime(notification.createdAt)}</span>
        </ItemMeta>
      </ItemContent>
      <ItemAction className="self-start">
        <Badge variant={getCategoryVariant(notification.category)} size="sm">
          {getCategoryLabel(notification.category)}
        </Badge>
        <Button
          variant="plain"
          size="xs-icon"
          onClick={() => onUpdateReadStatus(!notification.isRead)}
          progress={isPending}
          disabled={isPending}
          aria-label={
            notification.isRead
              ? "Mark notification unread"
              : "Mark notification read"
          }
        >
          {notification.isRead ? <IconMail /> : <IconMailOpened />}
        </Button>
        {notification.bookingId ? (
          <Button
            variant="plain"
            size="xs-icon"
            aria-label="View booking details"
            render={
              <Link
                to="/bookings/$bookingId"
                params={{ bookingId: notification.bookingId }}
                aria-label="View booking details"
              />
            }
            nativeButton={false}
          >
            <IconExternalLink />
          </Button>
        ) : null}
      </ItemAction>
    </Item>
  );
}

function NotificationsLoading() {
  return (
    <Card>
      <CardBody className="space-y-3">
        {[
          "notification-loading-1",
          "notification-loading-2",
          "notification-loading-3",
        ].map((key) => (
          <div
            key={key}
            className="h-20 animate-pulse rounded-(--radius-lg) bg-accent/50"
          />
        ))}
      </CardBody>
    </Card>
  );
}

async function invalidateNotificationQueries(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: orpc.notification.list.key() }),
    queryClient.invalidateQueries({
      queryKey: orpc.notification.getUnreadCount.key(),
    }),
  ]);
}
