"use client";

import { useState } from "react";
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
import { Input } from "@cogito-app/ui/components/selia/input";
import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@cogito-app/ui/components/selia/dialog";
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
import { BookingLifecycleActions } from "./booking-lifecycle-actions";
import {
  BookingRescheduleAction,
  canProposeBookingReschedule,
} from "./booking-reschedule-action";
import { orpc } from "@/utils/orpc";

export function BookingDetailPage({
  bookingId,
  viewerId,
  viewerRole,
}: {
  bookingId: string;
  viewerId: string;
  viewerRole: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [reviewDialog, setReviewDialog] = useState<"accept" | "decline" | null>(
    null,
  );
  const [declineReason, setDeclineReason] = useState("");
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
        toastManager.add({
          title: "Booking could not be cancelled",
          description: error.message,
          type: "error",
        }),
    }),
  );
  const accept = useMutation(
    orpc.tutorActions.acceptBooking.mutationOptions({
      onSuccess: () => {
        setReviewDialog(null);
        toastManager.add({ title: "Booking accepted", type: "success" });
        refreshBookingQueries();
      },
      onError: (error: Error) =>
        toastManager.add({
          title: "Booking could not be accepted",
          description: error.message,
          type: "error",
        }),
    }),
  );
  const decline = useMutation(
    orpc.tutorActions.declineBooking.mutationOptions({
      onSuccess: () => {
        setReviewDialog(null);
        setDeclineReason("");
        toastManager.add({ title: "Booking declined", type: "success" });
        refreshBookingQueries();
      },
      onError: (error: Error) =>
        toastManager.add({
          title: "Booking could not be declined",
          description: error.message,
          type: "error",
        }),
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
  const viewerParticipant = booking.participants.find(
    (participant) => participant.userId === viewerId,
  );
  const history = booking.stateHistory.toSorted(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const activeRescheduleProposal = booking.rescheduleProposals.find(
    (proposal) => proposal.status === "pending",
  );
  const viewerRescheduleDecision = activeRescheduleProposal?.decisions?.[
    viewerId
  ] as "pending" | "accepted" | "rejected" | undefined;
  const canReview = isTutor && booking.currentState === "awaiting_tutor_review";
  const canComplete = isTutor && booking.currentState === "scheduled";
  const sessionHasEnded =
    new Date(booking.scheduledEndAt).getTime() <= Date.now();
  const tutorActionPending =
    accept.isPending || decline.isPending || complete.isPending;
  const canProposeReschedule = canProposeBookingReschedule({
    viewerRole,
    isBookingProposer: booking.proposerId === viewerId,
    currentState: booking.currentState,
  });
  const rescheduleAction = canProposeReschedule ? (
    <BookingRescheduleAction
      bookingId={bookingId}
      tutorId={booking.tutorId}
      viewerRole={viewerRole}
      modality={booking.modality}
      currentStartAt={booking.scheduledStartAt}
      onBookingChanged={refreshBookingQueries}
    />
  ) : null;

  function requestCancellation() {
    const confirmed = window.confirm(
      "Cancel this booking? Cancellation rules and applicable refunds will be applied.",
    );
    if (confirmed) cancel.mutate({ bookingId });
  }

  function declineBooking() {
    const reason = declineReason.trim();
    if (!reason) return;
    decline.mutate({ bookingId, reason });
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
            <CardFooter className="flex-wrap justify-end gap-2">
              {rescheduleAction}
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
              {rescheduleAction}
              <Button
                variant="danger"
                size="sm"
                onClick={() => setReviewDialog("decline")}
                progress={decline.isPending}
                disabled={tutorActionPending}
              >
                Decline request
              </Button>
              <Button
                size="sm"
                onClick={() => setReviewDialog("accept")}
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
              <div className="flex flex-wrap justify-end gap-2">
                {rescheduleAction}
                <Button
                  size="sm"
                  onClick={completeSession}
                  progress={complete.isPending}
                  disabled={!sessionHasEnded || tutorActionPending}
                >
                  Complete session
                </Button>
              </div>
            </CardFooter>
          ) : canProposeReschedule ? (
            <CardFooter className="flex-wrap justify-end gap-2">
              {rescheduleAction}
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

      <BookingLifecycleActions
        bookingId={bookingId}
        viewerRole={viewerRole}
        currentState={booking.currentState}
        bookingType={booking.type}
        scheduledStartAt={booking.scheduledStartAt}
        timezone={booking.timezone}
        participantRole={viewerParticipant?.role}
        participantState={viewerParticipant?.confirmationState}
        perStudentMarks={booking.priceSnapshot?.perStudent}
        activeProposalId={activeRescheduleProposal?.id}
        viewerRescheduleDecision={viewerRescheduleDecision}
        proposedStartAt={activeRescheduleProposal?.proposedStartAt}
        proposedEndAt={activeRescheduleProposal?.proposedEndAt}
        rescheduleReason={activeRescheduleProposal?.reason ?? undefined}
        onBookingChanged={refreshBookingQueries}
      />

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

      <Dialog
        open={reviewDialog !== null}
        onOpenChange={(open) => {
          if (!open && !tutorActionPending) {
            setReviewDialog(null);
            setDeclineReason("");
          }
        }}
      >
        <DialogPopup>
          <DialogHeader className="flex-col items-start gap-1.5">
            <DialogTitle>
              {reviewDialog === "decline"
                ? "Decline booking request?"
                : "Accept booking request?"}
            </DialogTitle>
            <DialogDescription>
              {reviewDialog === "decline"
                ? "The held Marks will be released and the student will receive your reason."
                : "The student will be notified and this online session will move to scheduling."}
            </DialogDescription>
          </DialogHeader>
          {reviewDialog === "decline" ? (
            <DialogBody>
              <label
                htmlFor="decline-booking-reason"
                className="text-foreground font-medium"
              >
                Reason
              </label>
              <Input
                id="decline-booking-reason"
                value={declineReason}
                onChange={(event) => setDeclineReason(event.target.value)}
                placeholder="For example: I am unavailable at this time"
              />
              <Text className="text-sm text-muted">
                Give the student enough context to choose another tutor or time.
              </Text>
            </DialogBody>
          ) : null}
          <DialogFooter>
            <Button
              variant="secondary"
              type="button"
              aria-label="Close booking review dialog"
              onClick={() => {
                setReviewDialog(null);
                setDeclineReason("");
              }}
              disabled={tutorActionPending}
            >
              Cancel
            </Button>
            {reviewDialog === "decline" ? (
              <Button
                variant="danger"
                onClick={declineBooking}
                progress={decline.isPending}
                disabled={!declineReason.trim() || tutorActionPending}
              >
                Decline request
              </Button>
            ) : (
              <Button
                onClick={() => accept.mutate({ bookingId })}
                progress={accept.isPending}
                disabled={tutorActionPending}
              >
                Accept booking
              </Button>
            )}
          </DialogFooter>
        </DialogPopup>
      </Dialog>
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
