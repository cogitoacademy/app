"use client";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  IconCalendarEvent,
  IconClock,
  IconInbox,
  IconUser,
} from "@tabler/icons-react";
import { Avatar, AvatarFallback } from "@cogito-app/ui/components/selia/avatar";
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
import { IconBox } from "@cogito-app/ui/components/selia/icon-box";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import { Text } from "@cogito-app/ui/components/selia/text";

import {
  formatBookingDate,
  formatBookingTimeRange,
  getBookingStateLabel,
  getBookingStateVariant,
  getBookingTypeLabel,
} from "@/components/booking/booking-ui";
import { EmptyStateCard } from "@/components/empty-state";
import { orpc } from "@/utils/orpc";

const ACTIVE_STATES = ["awaiting_tutor_review", "scheduled"];

export function TutorBookingsPage() {
  const bookingsQuery = useQuery(
    orpc.tutorActions.listBookings.queryOptions({ input: {} }),
  );

  if (bookingsQuery.isPending) return <TutorBookingsSkeleton />;

  if (bookingsQuery.isError) {
    return (
      <Card>
        <CardBody className="flex min-h-72 flex-col items-center justify-center text-center">
          <IconBox variant="danger-subtle" size="lg" className="mb-4">
            <IconInbox />
          </IconBox>
          <Heading size="sm">Bookings could not be loaded</Heading>
          <Text className="mt-2 max-w-md text-muted">
            {bookingsQuery.error instanceof Error
              ? bookingsQuery.error.message
              : "The incoming booking queue is unavailable."}
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
    );
  }

  const bookings = bookingsQuery.data.items.toSorted((a, b) => {
    const stateDelta =
      ACTIVE_STATES.indexOf(a.currentState) -
      ACTIVE_STATES.indexOf(b.currentState);
    if (stateDelta !== 0) return stateDelta;
    return (
      new Date(a.scheduledStartAt).getTime() -
      new Date(b.scheduledStartAt).getTime()
    );
  });
  const needsReview = bookings.filter(
    (booking) => booking.currentState === "awaiting_tutor_review",
  ).length;
  const scheduled = bookings.filter(
    (booking) => booking.currentState === "scheduled",
  ).length;

  return (
    <Stack direction="column" spacing="lg">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Heading size="md">Tutor bookings</Heading>
          <Text className="text-muted">
            Review student requests and manage upcoming sessions.
          </Text>
        </div>
        <div className="flex gap-2">
          <Badge variant={needsReview > 0 ? "warning" : "secondary"} pill>
            {needsReview} need review
          </Badge>
          <Badge variant="info" pill>
            {scheduled} scheduled
          </Badge>
        </div>
      </div>

      {bookings.length === 0 ? (
        <EmptyStateCard
          icon={<IconInbox />}
          title="No bookings assigned yet"
          description="New student requests will appear here as soon as they are ready for your review."
          tone="secondary"
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {bookings.map((booking) => {
            const studentName = booking.proposer?.name ?? "Cogito student";
            return (
              <Card key={booking.id}>
                <CardHeader>
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar>
                      <AvatarFallback>
                        {studentName.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <CardTitle>{getBookingTypeLabel(booking.type)}</CardTitle>
                      <CardDescription className="truncate">
                        Requested by {studentName}
                      </CardDescription>
                    </div>
                  </div>
                  <Badge
                    variant={getBookingStateVariant(booking.currentState)}
                    pill
                  >
                    {getBookingStateLabel(booking.currentState)}
                  </Badge>
                </CardHeader>
                <CardBody className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <BookingFact
                      icon={<IconCalendarEvent />}
                      label="Date"
                      value={formatBookingDate(
                        booking.scheduledStartAt,
                        booking.timezone,
                      )}
                    />
                    <BookingFact
                      icon={<IconClock />}
                      label="Time"
                      value={formatBookingTimeRange(
                        booking.scheduledStartAt,
                        booking.scheduledEndAt,
                        booking.timezone,
                      )}
                    />
                    <BookingFact
                      icon={<IconUser />}
                      label="Format"
                      value={`${booking.modality === "online" ? "Online" : "Offline"} · ${booking.originalMarks} Marks`}
                    />
                  </div>
                  <Button
                    variant={
                      booking.currentState === "awaiting_tutor_review"
                        ? "primary"
                        : "secondary"
                    }
                    render={
                      <Link
                        to="/bookings/$bookingId"
                        params={{ bookingId: booking.id }}
                        aria-label={`Open booking from ${studentName}`}
                      />
                    }
                    nativeButton={false}
                  >
                    {booking.currentState === "awaiting_tutor_review"
                      ? "Review request"
                      : "View booking"}
                  </Button>
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </Stack>
  );
}

function BookingFact({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex gap-3">
      <IconBox variant="secondary-subtle" size="sm">
        {icon}
      </IconBox>
      <div className="min-w-0">
        <Text className="text-sm text-muted">{label}</Text>
        <Text className="truncate font-medium">{value}</Text>
      </div>
    </div>
  );
}

function TutorBookingsSkeleton() {
  return (
    <div className="grid animate-pulse gap-4 xl:grid-cols-2">
      <Card className="min-h-64 bg-accent/40" />
      <Card className="min-h-64 bg-accent/40" />
    </div>
  );
}
