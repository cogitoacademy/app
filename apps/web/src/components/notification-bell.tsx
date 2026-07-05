"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconBell } from "@tabler/icons-react";
import { Button } from "@cogito-app/ui/components/selia/button";
import { Badge } from "@cogito-app/ui/components/selia/badge";
import {
  Menu,
  MenuItem,
  MenuPopup,
  MenuTrigger,
} from "@cogito-app/ui/components/selia/menu";
import { Separator } from "@cogito-app/ui/components/selia/separator";
import { toastManager } from "@cogito-app/ui/components/selia/toast";

import { orpc } from "@/utils/orpc";

function formatRelativeTime(date: Date | string) {
  const d = typeof date === "string" ? new Date(date) : date;
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

export function NotificationBell() {
  const queryClient = useQueryClient();

  const countQuery = useQuery(
    orpc.notification.getUnreadCount.queryOptions({}),
  );

  const listQuery = useQuery(
    orpc.notification.list.queryOptions({ input: { limit: 10 } }),
  );

  const markRead = useMutation(
    orpc.notification.markAsRead.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({
          queryKey: orpc.notification.list.key(),
        });
        void queryClient.invalidateQueries({
          queryKey: orpc.notification.getUnreadCount.key(),
        });
      },
      onError: () => {
        toastManager.add({
          title: "Failed to mark notification read",
          type: "error",
        });
      },
    }),
  );

  const markAll = useMutation(
    orpc.notification.markAllAsRead.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({
          queryKey: orpc.notification.list.key(),
        });
        void queryClient.invalidateQueries({
          queryKey: orpc.notification.getUnreadCount.key(),
        });
        toastManager.add({
          title: "All notifications marked read",
          type: "success",
        });
      },
      onError: () => {
        toastManager.add({
          title: "Failed to mark all read",
          type: "error",
        });
      },
    }),
  );

  const unread = countQuery.data?.count ?? 0;

  return (
    <Menu>
      <MenuTrigger
        render={
          <Button
            variant="plain"
            size="sm-icon"
            aria-label="Notifications"
            data-slot="notification-trigger"
          />
        }
      >
        <span className="relative">
          <IconBell />
          {unread > 0 && (
            <Badge
              variant="danger"
              size="sm"
              className="absolute -right-1.5 -top-1.5 min-w-[1.25rem] px-1 text-center text-[10px]"
            >
              {unread > 99 ? "99+" : unread}
            </Badge>
          )}
        </span>
      </MenuTrigger>
      <MenuPopup className="w-80 max-w-[calc(100vw-2rem)]">
        <div className="flex items-center justify-between px-3 py-2">
          <span className="font-medium text-sm">Notifications</span>
          {unread > 0 && (
            <Button
              variant="plain"
              size="sm"
              onClick={() => markAll.mutate({})}
              progress={markAll.isPending}
              disabled={markAll.isPending}
            >
              Mark all read
            </Button>
          )}
        </div>
        <Separator />
        {listQuery.isLoading ? (
          <div className="px-3 py-4 text-center text-sm text-muted">
            Loading...
          </div>
        ) : listQuery.error ? (
          <div className="px-3 py-4 text-center text-sm text-danger">
            Failed to load
          </div>
        ) : listQuery.data?.items.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-muted">
            No notifications yet.
          </div>
        ) : (
          <div className="flex max-h-80 flex-col gap-0.5 overflow-y-auto py-1">
            {listQuery.data?.items.map((n) => (
              <MenuItem
                key={n.id}
                onClick={() => {
                  if (!n.isRead) markRead.mutate({ id: n.id });
                }}
                className={n.isRead ? "opacity-70" : "bg-accent/40"}
              >
                <div className="flex w-full flex-col gap-0.5 px-2 py-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={`text-sm ${n.isRead ? "font-normal" : "font-medium"}`}
                    >
                      {n.title}
                    </span>
                    <span className="shrink-0 text-xs text-dimmed">
                      {formatRelativeTime(n.createdAt)}
                    </span>
                  </div>
                  <span className="line-clamp-2 text-xs text-muted">
                    {n.body}
                  </span>
                </div>
              </MenuItem>
            ))}
          </div>
        )}
      </MenuPopup>
    </Menu>
  );
}
