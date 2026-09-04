"use client";

import { IconClock } from "@tabler/icons-react";
import { Text } from "@cogito-app/ui/components/selia/text";
import { useNow } from "@/hooks/use-now";

export const BOOKING_DEADLINE_STATES = new Set([
  "awaiting_tutor_review",
  "awaiting_participant_confirmation",
  "awaiting_reconfirmation",
  "awaiting_admin_room_approval",
  "reschedule_proposed",
]);

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

export function BookingDeadlineNotice({
  currentState,
  deadlineAt,
  timezone = "Asia/Jakarta",
}: {
  currentState: string;
  deadlineAt?: Date | string | null;
  timezone?: string;
}) {
  const deadlineTimestamp = deadlineAt ? new Date(deadlineAt).getTime() : NaN;
  const now = useNow();

  if (
    !BOOKING_DEADLINE_STATES.has(currentState) ||
    !Number.isFinite(deadlineTimestamp)
  ) {
    return null;
  }

  const remaining = deadlineTimestamp - now;
  const expired = remaining <= 0;
  const urgent = !expired && remaining <= HOUR_MS;
  const deadlineLabel = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(deadlineTimestamp));

  return (
    <div
      role="status"
      aria-live="polite"
      className={`mt-3 flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm ${
        expired || urgent
          ? "border-danger-border bg-danger/10"
          : "border-warning-border bg-warning/10"
      }`}
    >
      <IconClock
        aria-hidden="true"
        className={`mt-0.5 size-4 shrink-0 ${
          expired || urgent ? "text-danger" : "text-warning"
        }`}
      />
      <div className="min-w-0">
        <Text className="font-medium text-base/5">
          {expired
            ? "Response window passed"
            : `Respond by ${deadlineLabel} WIB`}
        </Text>
        <Text className="mt-0.5 text-xs text-muted">
          {expired
            ? "Refresh to see whether the booking has expired or moved to its next step."
            : `${formatRemaining(remaining)} remaining`}
        </Text>
      </div>
    </div>
  );
}

function formatRemaining(value: number) {
  const minutes = Math.max(1, Math.ceil(value / MINUTE_MS));
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes === 0
    ? `${hours}h`
    : `${hours}h ${remainingMinutes}m`;
}
