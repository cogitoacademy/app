"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  IconBell,
  IconCheck,
  IconClock,
  IconExternalLink,
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
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { IconBox } from "@cogito-app/ui/components/selia/icon-box";
import {
  Item,
  ItemAction,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemMeta,
  ItemTitle,
} from "@cogito-app/ui/components/selia/item";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import { Text } from "@cogito-app/ui/components/selia/text";
import { toastManager } from "@cogito-app/ui/components/selia/toast";

import { orpc } from "@/utils/orpc";

const PAGE_SIZE = 20;

function formatRelativeTime(date: Date | string) {
  const value = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - value.getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(value);
}

function getCategoryVariant(category: string) {
  if (category === "payment" || category === "refund")
    return "success" as const;
  if (category === "override" || category === "system")
    return "warning" as const;
  if (category === "booking" || category === "schedule") return "info" as const;
  return "secondary" as const;
}

export function NotificationsPage() {
  const queryClient = useQueryClient();
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

  const markAsRead = useMutation(
    orpc.notification.markAsRead.mutationOptions({
      onSuccess: () => {
        void invalidateNotificationQueries(queryClient);
      },
      onError: (error: Error) =>
        toastManager.add({
          title: "Notification could not be marked as read",
          description: error.message,
          type: "error",
        }),
    }),
  );

  const markAllAsRead = useMutation(
    orpc.notification.markAllAsRead.mutationOptions({
      onSuccess: () => {
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
    notificationsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const unreadCount =
    unreadQuery.data?.count ?? items.filter((item) => !item.isRead).length;

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
            Stay up to date with your bookings, payments, and account activity.
          </Text>
        </div>
        {unreadCount > 0 ? (
          <Button
            variant="outline"
            onClick={() => markAllAsRead.mutate({})}
            progress={markAllAsRead.isPending}
            disabled={markAllAsRead.isPending}
          >
            <IconCheck /> Mark all as read
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
        <Card>
          <CardBody className="flex min-h-64 flex-col items-center justify-center text-center">
            <IconBox variant="info-subtle" size="lg" className="mb-4">
              <IconBell />
            </IconBox>
            <Heading size="sm">You are all caught up</Heading>
            <Text className="mt-2 max-w-md text-muted">
              New booking and account updates will appear here.
            </Text>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>All activity</CardTitle>
            <CardDescription>
              Newest updates appear first. Select a booking to see its details.
            </CardDescription>
          </CardHeader>
          <CardBody className="space-y-2">
            {items.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                isPending={
                  markAsRead.isPending &&
                  markAsRead.variables?.id === notification.id
                }
                onMarkAsRead={() => markAsRead.mutate({ id: notification.id })}
              />
            ))}
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
  isPending,
  onMarkAsRead,
}: {
  notification: {
    id: string;
    bookingId: string | null;
    category: string;
    title: string;
    body: string;
    isRead: boolean;
    createdAt: Date | string;
  };
  isPending: boolean;
  onMarkAsRead: () => void;
}) {
  return (
    <Item
      variant={notification.isRead ? "plain" : "info"}
      size="md"
      className={notification.isRead ? "opacity-80" : undefined}
    >
      <ItemMedia>
        <IconBox
          variant={notification.isRead ? "secondary-subtle" : "info-subtle"}
        >
          {notification.isRead ? <IconClock /> : <IconBell />}
        </IconBox>
      </ItemMedia>
      <ItemContent>
        <div className="flex flex-wrap items-center gap-2">
          <ItemTitle>{notification.title}</ItemTitle>
          <Badge
            variant={getCategoryVariant(notification.category)}
            size="sm"
            pill
          >
            {notification.category}
          </Badge>
        </div>
        <ItemDescription>{notification.body}</ItemDescription>
        <ItemMeta>{formatRelativeTime(notification.createdAt)}</ItemMeta>
      </ItemContent>
      <ItemAction>
        {!notification.isRead ? (
          <Button
            variant="plain"
            size="sm"
            onClick={onMarkAsRead}
            progress={isPending}
            disabled={isPending}
          >
            Mark read
          </Button>
        ) : null}
        {notification.bookingId ? (
          <Button
            variant="plain"
            size="sm-icon"
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
