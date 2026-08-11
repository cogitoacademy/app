"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  IconCalendarEvent,
  IconCheck,
  IconClock,
  IconSearch,
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
import { Stack } from "@cogito-app/ui/components/selia/stack";
import { Text } from "@cogito-app/ui/components/selia/text";
import { toast } from "sonner";

import {
  canCancelBooking,
  formatBookingDate,
  getBookingStateDescription,
  getBookingStateLabel,
  getBookingStateVariant,
  getBookingTypeLabel,
} from "@/components/booking/booking-ui";
import { orpc } from "@/utils/orpc";

const AWAITING_STATES = new Set([
  "awaiting_tutor_review",
  "awaiting_reconfirmation",
  "awaiting_admin_room_approval",
  "awaiting_participant_confirmation",
  "reschedule_proposed",
]);

export function BookingsPage() {
  const queryClient = useQueryClient();
  const { data, error, isError, isFetching, isPending, refetch } = useQuery(
    orpc.booking.listMine.queryOptions({ input: {} }),
  );

  const cancel = useMutation(
    orpc.booking.cancel.mutationOptions({
      onSuccess: () => {
        toast.success("Booking cancelled");
        void queryClient.invalidateQueries({
          queryKey: orpc.booking.listMine.queryKey({ input: {} }),
        });
      },
      onError: (err: Error) => toast.error(err.message),
    }),
  );

  const bookings = data?.items ?? [];
  const upcomingCount = bookings.filter(
    (booking) =>
      canCancelBooking(booking.currentState) &&
      new Date(booking.scheduledEndAt).getTime() >= Date.now(),
  ).length;
  const awaitingCount = bookings.filter((booking) =>
    AWAITING_STATES.has(booking.currentState),
  ).length;
  const completedCount = bookings.filter(
    (booking) => booking.currentState === "completed",
  ).length;

  function requestCancellation(bookingId: string) {
    const confirmed = window.confirm(
      "Cancel this booking? Cancellation rules and applicable refunds will be applied.",
    );
    if (confirmed) cancel.mutate({ bookingId });
  }

  return (
    <Stack direction="column" spacing="lg">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Heading size="md">My Bookings</Heading>
            {isFetching && !isPending ? (
              <Badge variant="secondary" pill>
                Refreshing
              </Badge>
            ) : null}
          </div>
          <Text className="text-muted">
            Track upcoming sessions, confirmations, and booking history.
          </Text>
        </div>
        <Button
          render={<Link to="/tutors" aria-label="Find a tutor" />}
          nativeButton={false}
          className="sm:self-auto"
        >
          <IconSearch /> Find a tutor
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <BookingStat
          label="Upcoming"
          value={upcomingCount}
          icon={<IconCalendarEvent />}
          variant="info-subtle"
        />
        <BookingStat
          label="Needs attention"
          value={awaitingCount}
          icon={<IconClock />}
          variant="warning-subtle"
        />
        <BookingStat
          label="Completed"
          value={completedCount}
          icon={<IconCheck />}
          variant="success-subtle"
        />
      </div>

      {isPending ? (
        <BookingListSkeleton />
      ) : isError ? (
        <Card>
          <CardBody className="flex min-h-64 flex-col items-center justify-center text-center">
            <IconBox variant="danger-subtle" size="lg" className="mb-4">
              <IconCalendarEvent />
            </IconBox>
            <Heading size="sm">Bookings could not be loaded</Heading>
            <Text className="mt-1 max-w-md text-muted">
              {error instanceof Error
                ? error.message
                : "The booking service is temporarily unavailable."}
            </Text>
            <Button
              variant="secondary"
              className="mt-5"
              onClick={() => void refetch()}
            >
              Try again
            </Button>
          </CardBody>
        </Card>
      ) : bookings.length === 0 ? (
        <Card className="overflow-hidden">
          <CardBody className="relative flex min-h-72 flex-col items-center justify-center text-center">
            <div className="absolute inset-x-12 top-0 h-28 rounded-full bg-info/10 blur-3xl" />
            <IconBox variant="info-subtle" size="lg" className="relative mb-4">
              <IconCalendarEvent />
            </IconBox>
            <Heading size="sm" className="relative">
              Your learning calendar starts here
            </Heading>
            <Text className="relative mt-2 max-w-md text-muted">
              Browse verified tutors, choose the right modality, and your
              session will appear here once booked.
            </Text>
            <Button
              render={<Link to="/tutors" aria-label="Browse tutors" />}
              nativeButton={false}
              className="relative mt-5"
            >
              Browse tutors
            </Button>
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {bookings.map((booking) => {
            const cancelling =
              cancel.isPending && cancel.variables?.bookingId === booking.id;

            return (
              <Card key={booking.id} data-slot="booking-card">
                <CardHeader>
                  <CardTitle>{getBookingTypeLabel(booking.type)}</CardTitle>
                  <CardDescription>
                    {booking.tutor?.name ?? "Cogito tutor"}
                  </CardDescription>
                  <Badge
                    variant={getBookingStateVariant(booking.currentState)}
                    pill
                  >
                    {getBookingStateLabel(booking.currentState)}
                  </Badge>
                </CardHeader>
                <CardBody className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div>
                    <Text className="font-medium">
                      {formatBookingDate(
                        booking.scheduledStartAt,
                        booking.timezone,
                      )}
                    </Text>
                    <Text className="mt-1 text-muted">
                      {getBookingStateDescription(booking.currentState)}
                    </Text>
                  </div>
                  <div className="flex flex-wrap gap-2 sm:justify-end">
                    <Badge variant="secondary" pill>
                      {booking.modality === "online" ? "Online" : "Offline"}
                    </Badge>
                    <Badge variant="secondary" pill>
                      {booking.originalMarks} Marks
                    </Badge>
                  </div>
                </CardBody>
                <CardFooter className="justify-end">
                  {canCancelBooking(booking.currentState) ? (
                    <Button
                      variant="plain"
                      size="sm"
                      onClick={() => requestCancellation(booking.id)}
                      progress={cancelling}
                      disabled={cancel.isPending}
                    >
                      Cancel
                    </Button>
                  ) : null}
                  <Button
                    variant="secondary"
                    size="sm"
                    render={
                      <Link
                        to="/bookings/$bookingId"
                        params={{ bookingId: booking.id }}
                        aria-label="View booking details"
                      />
                    }
                    nativeButton={false}
                  >
                    View details
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
    </Stack>
  );
}

function BookingStat({
  label,
  value,
  icon,
  variant,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  variant: "info-subtle" | "warning-subtle" | "success-subtle";
}) {
  return (
    <Card>
      <CardBody className="flex items-center gap-4">
        <IconBox variant={variant} size="lg">
          {icon}
        </IconBox>
        <div>
          <Text className="text-sm text-muted">{label}</Text>
          <Text className="text-2xl font-semibold">{value}</Text>
        </div>
      </CardBody>
    </Card>
  );
}

function BookingListSkeleton() {
  const placeholders = ["booking-skeleton-primary", "booking-skeleton-secondary"];

  return (
    <div className="grid gap-4" aria-label="Loading bookings">
      {placeholders.map((placeholder) => (
        <Card key={placeholder} className="animate-pulse">
          <CardHeader>
            <div className="h-4 w-36 rounded bg-accent" />
            <div className="h-3 w-24 rounded bg-accent" />
          </CardHeader>
          <CardBody>
            <div className="h-4 w-56 rounded bg-accent" />
            <div className="mt-3 h-3 w-3/4 rounded bg-accent" />
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
