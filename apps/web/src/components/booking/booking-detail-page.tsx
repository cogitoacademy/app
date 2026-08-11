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
import { toastManager } from "@cogito-app/ui/components/selia/toast";

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

export function BookingDetailPage({
  bookingId,
  viewerRole,
}: {
  bookingId: string;
  viewerRole: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isTutor = viewerRole === "tutor";
  const bookingsPath = isTutor ? "/tutor-bookings" : "/bookings";
  const bookingsLabel = isTutor ? "Tutor bookings" : "My bookings";
  const bookingQuery = useQuery(
    orpc.booking.get.queryOptions({ input: { bookingId } }),
  );

  function refreshBookingQueries() {
    void Promise.all([
      queryClient.invalidateQueries({
        queryKey: orpc.booking.get.queryKey({ input: { bookingId } }),
      }),
      queryClient.invalidateQueries({
        queryKey: orpc.booking.listMine.queryKey({ input: {} }),
      }),
      queryClient.invalidateQueries({
        queryKey: orpc.tutorActions.listBookings.queryKey({ input: {} }),
      }),
    ]);
  }

  const cancel = useMutation(
    orpc.booking.cancel.mutationOptions({
      onSuccess: () => {
        toastManager.add({ title: "Booking cancelled", type: "success" });
        refreshBookingQueries();
      },
      onError: (error: Error) =>
        toastManager.add({ title: error.message, type: "error" }),
    }),
  );
  const accept = useMutation(
    orpc.tutorActions.acceptBooking.mutationOptions({
      onSuccess: () => {
        toastManager.add({ title: "Booking accepted", type: "success" });
        refreshBookingQueries();
      },
      onError: (error: Error) =>
        toastManager.add({ title: error.message, type: "error" }),
    }),
  );
  const decline = useMutation(
    orpc.tutorActions.declineBooking.mutationOptions({
      onSuccess: () => {
        toastManager.add({ title: "Booking declined", type: "success" });
        refreshBookingQueries();
      },
      onError: (error: Error) =>
        toastManager.add({ title: error.message, type: "error" }),
    }),
  );
  const complete = useMutation(
    orpc.tutorActions.completeSession.mutationOptions({
      onSuccess: () => {
        toastManager.add({ title: "Session completed", type: "success" });
        refreshBookingQueries();
      },
      onError: (error: Error) =>
        toastManager.add({ title: error.message, type: "error" }),
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
              onClick={() => void navigate({ to: bookingsPath })}
            >
              Back to {bookingsLabel.toLowerCase()}
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
  const canReview = isTutor && booking.currentState === "awaiting_tutor_review";
  const canComplete = isTutor && booking.currentState === "scheduled";
  const sessionHasEnded =
    new Date(booking.scheduledEndAt).getTime() <= Date.now();
  const tutorActionPending =
    accept.isPending || decline.isPending || complete.isPending;

  function requestCancellation() {
    const confirmed = window.confirm(
      "Cancel this booking? Cancellation rules and applicable refunds will be applied.",
    );
    if (confirmed) cancel.mutate({ bookingId });
  }

  function acceptBooking() {
    const confirmed = window.confirm(
      "Accept this booking request and schedule the session?",
    );
    if (confirmed) accept.mutate({ bookingId });
  }

  function declineBooking() {
    const reason = window.prompt(
      "Why are you declining this request? The student will see this reason.",
    );
    if (reason === null) return;
    decline.mutate({ bookingId, reason: reason.trim() || undefined });
  }

  function completeSession() {
    const confirmed = window.confirm(
      "Mark this session as completed? Held Marks will be settled.",
    );
    if (confirmed) complete.mutate({ bookingId });
  }

  return (
    <Stack direction="column" spacing="lg">
      <div>
        <Button
          variant="plain"
          size="sm"
          render={
            <Link to={bookingsPath} aria-label={`Back to ${bookingsLabel}`} />
          }
          nativeButton={false}
          className="mb-3"
        >
          <IconArrowLeft /> Back to {bookingsLabel.toLowerCase()}
        </Button>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Heading size="md">{getBookingTypeLabel(booking.type)}</Heading>
            <Text className="text-muted">
              {isTutor
                ? `Requested by ${booking.proposer?.name ?? "a Cogito student"}`
                : `Booking with ${booking.tutor?.name ?? "your Cogito tutor"}`}
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
          {!isTutor && canCancelBooking(booking.currentState) ? (
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
          ) : canReview ? (
            <CardFooter className="justify-end gap-2">
              <Button
                variant="danger"
                size="sm"
                onClick={declineBooking}
                progress={decline.isPending}
                disabled={tutorActionPending}
              >
                Decline request
              </Button>
              <Button
                size="sm"
                onClick={acceptBooking}
                progress={accept.isPending}
                disabled={tutorActionPending}
              >
                Accept booking
              </Button>
            </CardFooter>
          ) : canComplete ? (
            <CardFooter className="flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Text className="text-sm text-muted">
                {sessionHasEnded
                  ? "Confirm completion to settle the held Marks."
                  : "Completion becomes available after the scheduled end time."}
              </Text>
              <Button
                size="sm"
                onClick={completeSession}
                progress={complete.isPending}
                disabled={!sessionHasEnded || tutorActionPending}
              >
                Complete session
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
