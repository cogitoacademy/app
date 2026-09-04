"use client";

import { Button } from "@cogito-app/ui/components/selia/button";
import { Card, CardBody } from "@cogito-app/ui/components/selia/card";
import { IconBox } from "@cogito-app/ui/components/selia/icon-box";
import { Text } from "@cogito-app/ui/components/selia/text";
import { IconAlertTriangle } from "@tabler/icons-react";
import { useNow } from "@/hooks/use-now";

const SESSION_WARNING_WINDOW_MS = 30 * 60 * 1000;
const SESSION_TIMER_INTERVAL_MS = 30 * 1000;

type SessionExpiryValue = Date | string | number | null | undefined;

function toTimestamp(value: SessionExpiryValue) {
  if (value === null || value === undefined) {
    return null;
  }

  const timestamp =
    value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function getRemainingMs(expiresAt: number | null, now: number) {
  return expiresAt === null ? null : Math.max(0, expiresAt - now);
}

function formatRemaining(remainingMs: number) {
  const minutes = Math.max(1, Math.ceil(remainingMs / 60_000));

  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes === 0
    ? `${hours} hour${hours === 1 ? "" : "s"}`
    : `${hours}h ${remainingMinutes}m`;
}

function getLoginUrl() {
  const redirect = `${window.location.pathname}${window.location.search}`;
  const search = new URLSearchParams({
    redirect,
    reason: "session-expired",
  });
  return `/login?${search.toString()}`;
}

export function SessionExpiryNotice({
  expiresAt,
}: {
  expiresAt?: SessionExpiryValue;
}) {
  const expiryTimestamp = toTimestamp(expiresAt);
  const now = useNow(SESSION_TIMER_INTERVAL_MS);
  const remainingMs = getRemainingMs(expiryTimestamp, now);

  if (
    expiryTimestamp === null ||
    remainingMs === null ||
    remainingMs > SESSION_WARNING_WINDOW_MS
  ) {
    return null;
  }

  const expired = remainingMs === 0;

  return (
    <Card
      className="border border-warning-border bg-warning/10 ring-0 shadow-none"
      role="status"
      aria-live={expired ? "assertive" : "polite"}
    >
      <CardBody className="flex items-center gap-3 p-4">
        <IconBox
          variant={expired ? "danger-subtle" : "warning-subtle"}
          size="sm"
          aria-hidden="true"
        >
          <IconAlertTriangle />
        </IconBox>
        <div className="min-w-0 flex-1">
          <Text className="font-medium">
            {expired
              ? "Your session has expired."
              : `Your session expires in ${formatRemaining(remainingMs)}.`}
          </Text>
          <Text className="mt-1 text-sm text-muted">
            {expired
              ? "Sign in again to continue working."
              : "Save any changes before you are signed out."}
          </Text>
        </div>
        <Button
          variant={expired ? "primary" : "outline"}
          size="sm"
          onClick={() => {
            window.location.assign(getLoginUrl());
          }}
        >
          Sign in again
        </Button>
      </CardBody>
    </Card>
  );
}
