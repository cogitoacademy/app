"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  IconArrowLeft,
  IconCalendarEvent,
  IconClock,
  IconCoins,
  IconDeviceLaptop,
  IconMapPin,
  IconUsers,
} from "@tabler/icons-react";
import { Avatar, AvatarFallback } from "@cogito-app/ui/components/selia/avatar";
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
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemMeta,
  ItemTitle,
} from "@cogito-app/ui/components/selia/item";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import { Text } from "@cogito-app/ui/components/selia/text";
import { toast } from "sonner";

import {
  canCancelBooking,
  formatBookingDate,
  formatBookingTimeRange,
  getBookingStateDescription,
  getBookingStateLabel,
  getBookingStateVariant,
  getBookingTypeLabel,
} from "./booking-ui";
import { orpc } from "@/utils/orpc";

export function BookingDetailPage({ bookingId }: { bookingId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const bookingQuery = useQuery(
    orpc.booking.get.queryOptions({ input: { bookingId } }),
  );
  const cancel = useMutation(
    orpc.booking.cancel.mutationOptions({
      onSuccess: () => {
        toast.success("Booking cancelled");
        void queryClient.invalidateQueries({
          queryKey: orpc.booking.listMine.queryKey({ input: {} }),
        });
        void queryClient.invalidateQueries({
          queryKey: orpc.booking.get.queryKey({ input: { bookingId } }),
        });
      },
      onError: (error: Error) => toast.error(error.message),
    }),
  );

  if (bookingQuery.isPending) return <BookingDetailSkeleton />;

  if (bookingQuery.isError) {
    return (
      <Card>
        <CardBody className="flex min-h-72 flex-col items-center justify-center text-center">
          <IconBox variant="danger-subtle" size="lg" className="mb-4">
            <IconCalendarEvent />
          </IconBox>
          <Heading size="sm">Booking details are unavailable</Heading>
          <Text className="mt-2 max-w-md text-muted">
            {bookingQuery.error instanceof Error
              ? bookingQuery.error.message
              : "This booking could not be loaded."}
          </Text>
          <div className="mt-5 flex gap-2">
            <Button
              variant="secondary"
              onClick={() => void bookingQuery.refetch()}
            >
              Try again
            </Button>
            <Button
              variant="plain"
              onClick={() => void navigate({ to: "/bookings" })}
            >
              Back to bookings
            </Button>
          </div>
        </CardBody>
      </Card>
    );
  }

  const booking = bookingQuery.data;
  const activeRoomBooking = booking.roomBookings.find(
    (entry) => entry.status !== "cancelled",
  );
  const history = booking.stateHistory.toSorted(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  function requestCancellation() {
    const confirmed = window.confirm(
      "Cancel this booking? Cancellation rules and applicable refunds will be applied.",
    );
    if (confirmed) cancel.mutate({ bookingId });
  }

  return (
    <Stack direction="column" spacing="lg">
      <div>
        <Button
          variant="plain"
          size="sm"
          render={<Link to="/bookings" aria-label="Back to bookings" />}
          nativeButton={false}
          className="mb-3"
        >
          <IconArrowLeft /> Back to bookings
        </Button>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Heading size="md">{getBookingTypeLabel(booking.type)}</Heading>
            <Text className="text-muted">
              Booking with {booking.tutor?.name ?? "your Cogito tutor"}
            </Text>
          </div>
          <Badge variant={getBookingStateVariant(booking.currentState)} pill>
            {getBookingStateLabel(booking.currentState)}
          </Badge>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <IconBox variant="info-subtle">
              <IconCalendarEvent />
            </IconBox>
            <CardTitle>Session details</CardTitle>
            <CardDescription>
              {getBookingStateDescription(booking.currentState)}
            </CardDescription>
          </CardHeader>
          <CardBody className="grid gap-5 sm:grid-cols-2">
            <DetailField
              icon={<IconCalendarEvent />}
              label="Date"
              value={formatBookingDate(
                booking.scheduledStartAt,
                booking.timezone,
              )}
            />
            <DetailField
              icon={<IconClock />}
              label="Session time"
              value={formatBookingTimeRange(
                booking.scheduledStartAt,
                booking.scheduledEndAt,
                booking.timezone,
              )}
            />
            <DetailField
              icon={
                booking.modality === "online" ? (
                  <IconDeviceLaptop />
                ) : (
                  <IconMapPin />
                )
              }
              label="Modality"
              value={booking.modality === "online" ? "Online" : "Offline"}
            />
            <DetailField
              icon={<IconUsers />}
              label="Participants"
              value={`${booking.confirmedHeadcount} of ${booking.targetGroupSize} confirmed`}
            />
          </CardBody>
          {canCancelBooking(booking.currentState) ? (
            <CardFooter className="justify-end">
              <Button
                variant="danger"
                size="sm"
                onClick={requestCancellation}
                progress={cancel.isPending}
                disabled={cancel.isPending}
              >
                Cancel booking
              </Button>
            </CardFooter>
          ) : null}
        </Card>

        <Card>
          <CardHeader>
            <IconBox variant="warning-subtle">
              <IconCoins />
            </IconBox>
            <CardTitle>Marks summary</CardTitle>
            <CardDescription>Reserved for this booking</CardDescription>
          </CardHeader>
          <CardBody className="space-y-4">
            <SummaryRow
              label="Original price"
              value={`${booking.originalMarks} Marks`}
            />
            <SummaryRow
              label="Currently held"
              value={`${booking.holdAmount} Marks`}
            />
            <SummaryRow
              label="Refunded"
              value={`${booking.refundedAmount} Marks`}
            />
            {booking.priceSnapshot ? (
              <SummaryRow
                label="Per participant"
                value={`${booking.priceSnapshot.perStudent} Marks`}
              />
            ) : null}
          </CardBody>
        </Card>
      </div>

      {booking.modality === "online" ? (
        <Card>
          <CardHeader>
            <IconBox variant="info-subtle">
              <IconDeviceLaptop />
            </IconBox>
            <CardTitle>Online session</CardTitle>
            <CardDescription>
              Meeting access appears after all required confirmations.
            </CardDescription>
          </CardHeader>
          <CardBody>
            {booking.meeting?.meetingUrl ? (
              <Button
                render={
                  <a
                    href={booking.meeting.meetingUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Open meeting room"
                  />
                }
                nativeButton={false}
              >
                Open meeting room
              </Button>
            ) : (
              <Text className="text-muted">
                The meeting link is not available yet.
              </Text>
            )}
          </CardBody>
        </Card>
      ) : activeRoomBooking ? (
        <Card>
          <CardHeader>
            <IconBox variant="info-subtle">
              <IconMapPin />
            </IconBox>
            <CardTitle>Offline room</CardTitle>
            <CardDescription>{activeRoomBooking.status}</CardDescription>
          </CardHeader>
          <CardBody>
            <Text className="font-medium">{activeRoomBooking.room.name}</Text>
            <Text className="text-muted">
              {activeRoomBooking.room.location}
            </Text>
          </CardBody>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Participants</CardTitle>
            <CardDescription>People included in this booking</CardDescription>
          </CardHeader>
          <CardBody className="space-y-3">
            {booking.participants.map((participant) => (
              <Item key={participant.id} variant="plain" size="sm">
                <ItemMedia>
                  <Avatar>
                    <AvatarFallback>
                      {participant.user?.name.slice(0, 2).toUpperCase() ?? "CG"}
                    </AvatarFallback>
                  </Avatar>
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>
                    {participant.user?.name ?? "Participant"}
                  </ItemTitle>
                  <ItemDescription>{participant.role}</ItemDescription>
                </ItemContent>
                <ItemMeta>{participant.confirmationState}</ItemMeta>
              </Item>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Status history</CardTitle>
            <CardDescription>Latest booking updates</CardDescription>
          </CardHeader>
          <CardBody className="space-y-3">
            {history.length > 0 ? (
              history.map((entry) => (
                <Item key={entry.id} variant="plain" size="sm">
                  <ItemMedia>
                    <IconBox variant="secondary-subtle" size="sm">
                      <IconClock />
                    </IconBox>
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>{getBookingStateLabel(entry.toState)}</ItemTitle>
                    <ItemDescription>
                      {entry.reason ?? `Updated by ${entry.actorType}`}
                    </ItemDescription>
                  </ItemContent>
                  <ItemMeta>
                    {new Intl.DateTimeFormat("en-GB", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(new Date(entry.createdAt))}
                  </ItemMeta>
                </Item>
              ))
            ) : (
              <Text className="text-muted">No state changes recorded yet.</Text>
            )}
          </CardBody>
        </Card>
      </div>
    </Stack>
  );
}

function DetailField({
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
      <div>
        <Text className="text-sm text-muted">{label}</Text>
        <Text className="font-medium">{value}</Text>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <Text className="text-muted">{label}</Text>
      <Text className="font-medium">{value}</Text>
    </div>
  );
}

function BookingDetailSkeleton() {
  return (
    <div className="grid animate-pulse gap-4 lg:grid-cols-[1.4fr_1fr]">
      <Card className="min-h-80 bg-accent/40" />
      <Card className="min-h-80 bg-accent/40" />
    </div>
  );
}
