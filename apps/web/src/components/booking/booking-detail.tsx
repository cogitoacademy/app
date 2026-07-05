"use client";

import { useNavigate } from "@tanstack/react-router";
import {
  IconArrowLeft,
  IconCalendar,
  IconLink,
  IconMapPin,
  IconVideo,
} from "@tabler/icons-react";

import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { Separator } from "@cogito-app/ui/components/selia/separator";
import { Stack } from "@cogito-app/ui/components/selia/stack";

const STATE_VARIANTS: Record<string, string> = {
  awaiting_tutor_review: "warning",
  awaiting_participant_confirmation: "warning",
  awaiting_reconfirmation: "warning",
  awaiting_admin_room_approval: "warning",
  confirmed: "info",
  scheduled: "success",
  completed: "success",
  declined: "danger",
  cancelled: "danger",
  late_cancelled: "danger",
  no_show: "danger",
  expired: "danger",
  draft: "secondary",
  awaiting_marks_hold: "secondary",
  reschedule_proposed: "warning",
};

const STATE_LABELS: Record<string, string> = {
  awaiting_tutor_review: "Awaiting tutor review",
  awaiting_participant_confirmation: "Awaiting participants",
  awaiting_reconfirmation: "Awaiting reconfirmation",
  awaiting_admin_room_approval: "Awaiting room approval",
  confirmed: "Confirmed",
  scheduled: "Scheduled",
  completed: "Completed",
  declined: "Declined",
  cancelled: "Cancelled",
  late_cancelled: "Late cancelled",
  no_show: "No show",
  expired: "Expired",
  draft: "Draft",
  awaiting_marks_hold: "Awaiting marks hold",
  reschedule_proposed: "Reschedule proposed",
};

function formatDate(iso: string | Date) {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString("id-ID", { dateStyle: "medium" });
}

function formatTime(iso: string | Date) {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleTimeString("id-ID", { timeStyle: "short" });
}

function isSessionDay(iso: string | Date) {
  const start = typeof iso === "string" ? new Date(iso) : iso;
  const now = new Date();
  return (
    start.getFullYear() === now.getFullYear() &&
    start.getMonth() === now.getMonth() &&
    start.getDate() === now.getDate()
  );
}

function isJoinWindowOpen(iso: string | Date) {
  const start = typeof iso === "string" ? new Date(iso) : iso;
  const now = new Date();
  const diffMin = (start.getTime() - now.getTime()) / 60000;
  return diffMin <= 15 && diffMin >= -120;
}

export function BookingDetail({ booking }: { booking: any }) {
  const navigate = useNavigate();
  const status = booking.currentState as string;
  const modality = booking.modality as "online" | "offline";
  const typeLabel =
    booking.type === "solo"
      ? "Solo session"
      : booking.type === "group"
        ? "Group session"
        : "Series";

  const tutorName = booking.tutor?.name ?? "Tutor";
  const roomBooking = booking.roomBookings?.[0];
  const roomName = roomBooking?.room?.name;
  const roomLocation = roomBooking?.room?.location;
  const meetingUrl = booking.meeting?.meetingUrl as string | undefined;

  const showJoin =
    status === "scheduled" &&
    (isSessionDay(booking.scheduledStartAt) ||
      isJoinWindowOpen(booking.scheduledStartAt));

  return (
    <Stack direction="column" spacing="lg">
      <div className="flex items-center gap-2">
        <Button
          variant="plain"
          size="sm-icon"
          onClick={() => navigate({ to: "/bookings" })}
        >
          <IconArrowLeft />
        </Button>
        <Heading size="md">Booking Detail</Heading>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <CardTitle>{typeLabel}</CardTitle>
              <CardDescription>with {tutorName}</CardDescription>
            </div>
            <Badge variant={(STATE_VARIANTS[status] ?? "secondary") as never}>
              {STATE_LABELS[status] ?? status}
            </Badge>
          </div>
        </CardHeader>
        <CardBody className="flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <IconCalendar className="mt-0.5 text-muted" />
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">
                {formatDate(booking.scheduledStartAt)}
              </span>
              <span className="text-sm text-muted">
                {formatTime(booking.scheduledStartAt)} —{" "}
                {formatTime(booking.scheduledEndAt)} ({modality})
              </span>
            </div>
          </div>

          <Separator />

          {status === "scheduled" && modality === "online" && (
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="mb-3 flex items-center gap-2">
                <IconVideo className="text-success" />
                <span className="font-medium">Online Session</span>
              </div>
              {meetingUrl ? (
                <a
                  href={meetingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-primary hover:underline"
                >
                  <IconLink className="size-4" />
                  Join meeting
                </a>
              ) : showJoin ? (
                <div className="text-sm text-muted">
                  Meeting link will appear 15 minutes before the session starts.
                </div>
              ) : (
                <div className="text-sm text-muted">
                  Join button will be available on the session day.
                </div>
              )}
            </div>
          )}

          {status === "scheduled" && modality === "offline" && (
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="mb-3 flex items-center gap-2">
                <IconMapPin className="text-success" />
                <span className="font-medium">In-Person Session</span>
              </div>
              {roomName ? (
                <div className="flex flex-col gap-0.5 text-sm">
                  <span className="font-medium">{roomName}</span>
                  <span className="text-muted">{roomLocation}</span>
                </div>
              ) : (
                <div className="text-sm text-muted">
                  Room details will be shared before the session starts.
                </div>
              )}
            </div>
          )}
        </CardBody>
      </Card>
    </Stack>
  );
}
