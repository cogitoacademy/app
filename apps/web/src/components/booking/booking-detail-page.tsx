"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  IconArrowLeft,
  IconCalendarEvent,
  IconCheck,
  IconClock,
  IconCoins,
  IconDeviceLaptop,
  IconInfoCircle,
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
  Field,
  FieldDescription,
  FieldLabel,
} from "@cogito-app/ui/components/selia/field";
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
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { orpc } from "@/utils/orpc";

type BookingConfirmation = {
  action: "cancel" | "complete";
  sessionId?: string;
} | null;

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
  const [confirmationDialog, setConfirmationDialog] =
    useState<BookingConfirmation>(null);
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
        setConfirmationDialog(null);
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
        setConfirmationDialog(null);
        toastManager.add({ title: "Session completed", type: "success" });
        refreshBookingQueries();
      },
      onError: (error: Error) =>
        toastManager.add({ title: error.message, type: "error" }),
    }),
  );

  const sessionsQuery = useQuery(
    orpc.booking.listSessions.queryOptions({
      input: { bookingId },
      enabled: bookingQuery.data?.type === "series",
    }),
  );
  const completeSessionById = (sessionId: string) => {
    setConfirmationDialog({ action: "complete", sessionId });
  };

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
  const confirmationPending = cancel.isPending || complete.isPending;
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
    setConfirmationDialog({ action: "cancel" });
  }

  function declineBooking() {
    const reason = declineReason.trim();
    if (!reason) return;
    decline.mutate({ bookingId, reason });
  }

  function completeSession() {
    setConfirmationDialog({ action: "complete" });
  }

  function confirmBookingAction() {
    if (!confirmationDialog) return;

    if (confirmationDialog.action === "cancel") {
      cancel.mutate({ bookingId });
      return;
    }

    if (confirmationDialog.sessionId) {
      complete.mutate({ bookingId, sessionId: confirmationDialog.sessionId });
    } else {
      complete.mutate({ bookingId });
    }
  }

  return (
    <Stack
      direction="column"
      spacing="lg"
      className="mx-auto w-full min-w-0 max-w-7xl"
    >
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
      </div>

      <header className="border-b border-border pb-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Text className="text-sm font-medium text-muted">
                {getBookingTypeLabel(booking.type)} booking
              </Text>
              <span className="text-dimmed" aria-hidden="true">
                ·
              </span>
              <Text className="text-sm text-muted">
                {booking.modality === "online" ? "Online" : "Offline"}
              </Text>
            </div>
            <Heading className="break-words text-2xl">
              {isTutor
                ? `${booking.proposer?.name ?? "Student"}'s booking request`
                : `Session with ${booking.tutor?.name ?? "your tutor"}`}
            </Heading>
            <Text className="mt-2 max-w-2xl text-muted">
              {getBookingStateDescription(booking.currentState)}
            </Text>
            {booking.disclaimer ? (
              <div className="mt-3 max-w-2xl rounded-lg border border-warning-border bg-warning/10 px-3 py-2 text-sm text-warning-foreground">
                {booking.disclaimer}
              </div>
            ) : null}
          </div>
          <Badge variant={getBookingStateVariant(booking.currentState)} pill>
            {getBookingStateLabel(booking.currentState)}
          </Badge>
        </div>
      </header>

      <div className="grid w-full min-w-0 grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)]">
        <div className="grid min-w-0 gap-4">
          <Card className="min-w-0 overflow-hidden">
            <CardHeader>
              <CardTitle>Session overview</CardTitle>
              <CardDescription>
                The essentials for this booking, all in one place.
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
                label="Format"
                value={booking.modality === "online" ? "Online" : "Offline"}
              />
              <DetailField
                icon={<IconUsers />}
                label="Attendance"
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

          {booking.type === "series" ? (
            <Card className="min-w-0 overflow-hidden">
              <CardHeader>
                <CardTitle>Series sessions</CardTitle>
                <CardDescription>
                  Each session is completed individually to settle its held
                  Marks.
                </CardDescription>
              </CardHeader>
              <CardBody className="grid gap-3">
                {sessionsQuery.data?.map((session) => {
                  const sessionEnded =
                    new Date(session.scheduledEndAt).getTime() <= Date.now();
                  const completed =
                    session.currentState === "completed" ||
                    session.currentState === "cancelled";
                  return (
                    <div
                      key={session.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-item-border bg-item p-3"
                    >
                      <div className="min-w-0">
                        <Text className="font-medium">
                          {formatBookingDate(
                            session.scheduledStartAt,
                            booking.timezone,
                          )}
                        </Text>
                        <Text className="text-sm text-muted">
                          {formatBookingTimeRange(
                            session.scheduledStartAt,
                            session.scheduledEndAt,
                            booking.timezone,
                          )}
                        </Text>
                      </div>
                      {completed ? (
                        <Badge variant="tertiary" pill>
                          {session.currentState}
                        </Badge>
                      ) : isTutor &&
                        session.currentState === "scheduled" &&
                        sessionEnded ? (
                        <Button
                          size="sm"
                          onClick={() => completeSessionById(session.id)}
                          progress={complete.isPending}
                          disabled={tutorActionPending}
                        >
                          Complete session
                        </Button>
                      ) : (
                        <Badge pill>{session.currentState}</Badge>
                      )}
                    </div>
                  );
                })}
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
            isRescheduleProposer={
              activeRescheduleProposal?.proposedBy === viewerId
            }
            viewerRescheduleDecision={viewerRescheduleDecision}
            proposedStartAt={activeRescheduleProposal?.proposedStartAt}
            proposedEndAt={activeRescheduleProposal?.proposedEndAt}
            rescheduleReason={activeRescheduleProposal?.reason ?? undefined}
            onBookingChanged={refreshBookingQueries}
          />

          <Card className="min-w-0 overflow-hidden">
            <CardHeader>
              <CardTitle>Activity</CardTitle>
              <CardDescription>
                A chronological record of this booking
              </CardDescription>
            </CardHeader>
            <CardBody className="px-6 py-2">
              {history.length > 0 ? (
                <div className="divide-y divide-border">
                  {history.map((entry) => (
                    <div key={entry.id} className="relative flex gap-3 py-4">
                      <IconBox variant="secondary-subtle" size="sm">
                        <IconClock />
                      </IconBox>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                          <Text className="font-medium">
                            {getBookingStateLabel(entry.toState)}
                          </Text>
                          <Text className="text-xs text-dimmed">
                            {new Intl.DateTimeFormat("en-GB", {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            }).format(new Date(entry.createdAt))}
                          </Text>
                        </div>
                        <Text className="mt-1 break-words text-sm text-muted">
                          {entry.reason ?? `Updated by ${entry.actorType}`}
                        </Text>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <Text className="py-4 text-muted">
                  No activity recorded yet.
                </Text>
              )}
            </CardBody>
          </Card>
        </div>

        <aside className="grid min-w-0 gap-4 lg:sticky lg:top-4">
          <Card className="min-w-0 overflow-hidden">
            <CardHeader>
              <CardTitle>Session access</CardTitle>
              <CardDescription>
                {booking.modality === "online"
                  ? "Online meeting"
                  : "Offline room"}
              </CardDescription>
            </CardHeader>
            <CardBody>
              {booking.modality === "online" ? (
                booking.meeting?.meetingUrl ? (
                  <Button
                    className="w-full"
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
                    <IconDeviceLaptop /> Open meeting room
                  </Button>
                ) : (
                  <Text className="text-sm text-muted">
                    The meeting link appears after all required confirmations.
                  </Text>
                )
              ) : activeRoomBooking ? (
                <div>
                  <Text className="font-medium">
                    {activeRoomBooking.room.name}
                  </Text>
                  <Text className="mt-1 break-words text-sm text-muted">
                    {activeRoomBooking.room.location}
                  </Text>
                </div>
              ) : (
                <Text className="text-sm text-muted">
                  Room details are not available yet.
                </Text>
              )}
            </CardBody>
          </Card>

          <Card className="min-w-0 overflow-hidden">
            <CardHeader>
              <IconBox variant="warning-subtle">
                <IconCoins />
              </IconBox>
              <CardTitle>Marks</CardTitle>
              <CardDescription>Cost and reservation</CardDescription>
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

          <Card className="min-w-0 overflow-hidden">
            <CardHeader>
              <CardTitle>Participants</CardTitle>
              <CardDescription>
                {booking.confirmedHeadcount} confirmed
              </CardDescription>
            </CardHeader>
            <CardBody className="space-y-1 p-2">
              {booking.participants.map((participant) => (
                <Item
                  key={participant.id}
                  variant="plain"
                  size="sm"
                  className="min-w-0 items-center"
                >
                  <ItemMedia>
                    <Avatar>
                      <AvatarFallback>
                        {participant.user?.name.slice(0, 2).toUpperCase() ??
                          "CG"}
                      </AvatarFallback>
                    </Avatar>
                  </ItemMedia>
                  <ItemContent className="min-w-0 flex-1">
                    <ItemTitle className="truncate">
                      {participant.user?.name ?? "Participant"}
                    </ItemTitle>
                    <ItemDescription className="truncate capitalize">
                      {participant.role} ·{" "}
                      {participant.confirmationState.replaceAll("_", " ")}
                    </ItemDescription>
                  </ItemContent>
                </Item>
              ))}
            </CardBody>
          </Card>
        </aside>
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
        <DialogPopup className="sm:max-w-lg">
          <DialogHeader className="flex-col items-start gap-3 pb-0">
            {reviewDialog === "accept" ? (
              <IconBox
                variant="success-subtle"
                size="md"
                circle
                aria-hidden="true"
              >
                <IconCheck />
              </IconBox>
            ) : null}
            <div className="space-y-1.5">
              <DialogTitle>
                {reviewDialog === "decline"
                  ? "Decline booking request?"
                  : "Accept booking request?"}
              </DialogTitle>
              <DialogDescription>
                {reviewDialog === "decline"
                  ? "The held Marks will be released and the student will receive your reason."
                  : booking.modality === "online"
                    ? "The student will be notified and the session will move to scheduling."
                    : "The student will be notified and the booking will move to room confirmation."}
              </DialogDescription>
            </div>
          </DialogHeader>
          {reviewDialog === "accept" ? (
            <DialogBody className="space-y-4">
              <div className="rounded-lg border border-item-border bg-item p-4">
                <div className="flex items-start gap-3">
                  <IconBox
                    variant="secondary-subtle"
                    size="sm"
                    aria-hidden="true"
                  >
                    <IconCalendarEvent />
                  </IconBox>
                  <div className="min-w-0">
                    <Text className="text-xs font-semibold uppercase tracking-wide text-muted">
                      Session details
                    </Text>
                    <Text className="mt-1 font-medium">
                      {formatBookingDate(
                        booking.scheduledStartAt,
                        booking.timezone,
                      )}
                    </Text>
                    <Text className="text-sm text-muted">
                      {formatBookingTimeRange(
                        booking.scheduledStartAt,
                        booking.scheduledEndAt,
                        booking.timezone,
                      )}
                    </Text>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-item-border pt-3">
                  <ReviewMeta
                    icon={
                      booking.modality === "online" ? (
                        <IconDeviceLaptop />
                      ) : (
                        <IconMapPin />
                      )
                    }
                    label="Format"
                    value={booking.modality === "online" ? "Online" : "Offline"}
                  />
                  <ReviewMeta
                    icon={<IconUsers />}
                    label="Attendance"
                    value={`${booking.confirmedHeadcount} of ${booking.targetGroupSize}`}
                  />
                </div>
              </div>
              <div className="flex items-start gap-2.5 rounded-lg border border-info-border bg-info/10 px-3 py-3">
                <IconInfoCircle
                  className="mt-0.5 size-4 shrink-0 text-info"
                  aria-hidden="true"
                />
                <Text className="text-sm text-foreground">
                  Accepting confirms this time for the student. You can still
                  propose a new time later if plans change.
                </Text>
              </div>
            </DialogBody>
          ) : (
            <DialogBody className="space-y-4">
              <Field>
                <FieldLabel htmlFor="decline-booking-reason">Reason</FieldLabel>
                <Input
                  id="decline-booking-reason"
                  value={declineReason}
                  onChange={(event) => setDeclineReason(event.target.value)}
                  placeholder="For example: I am unavailable at this time"
                />
                <FieldDescription>
                  Give the student enough context to choose another tutor or
                  time.
                </FieldDescription>
              </Field>
            </DialogBody>
          )}
          <DialogFooter className="flex-col-reverse items-stretch sm:flex-row sm:items-center">
            <Button
              variant="secondary"
              type="button"
              aria-label="Close booking review dialog"
              onClick={() => {
                setReviewDialog(null);
                setDeclineReason("");
              }}
              disabled={tutorActionPending}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            {reviewDialog === "decline" ? (
              <Button
                variant="danger"
                onClick={declineBooking}
                progress={decline.isPending}
                disabled={!declineReason.trim() || tutorActionPending}
                className="w-full sm:w-auto"
              >
                Decline request
              </Button>
            ) : (
              <Button
                onClick={() => accept.mutate({ bookingId })}
                progress={accept.isPending}
                disabled={tutorActionPending}
                className="w-full sm:w-auto"
              >
                Accept booking
              </Button>
            )}
          </DialogFooter>
        </DialogPopup>
      </Dialog>
      <ConfirmationDialog
        open={confirmationDialog !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmationDialog(null);
        }}
        title={
          confirmationDialog?.action === "cancel"
            ? "Cancel this booking?"
            : confirmationDialog?.sessionId
              ? "Complete this session?"
              : "Mark this session as completed?"
        }
        description={
          confirmationDialog?.action === "cancel"
            ? "Cancellation rules and applicable refunds will be applied."
            : "Held Marks will be settled."
        }
        confirmLabel={
          confirmationDialog?.action === "cancel"
            ? "Cancel booking"
            : "Complete session"
        }
        confirmVariant={
          confirmationDialog?.action === "cancel" ? "danger" : "primary"
        }
        pending={confirmationPending}
        onConfirm={confirmBookingAction}
      />
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

function ReviewMeta({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="text-muted [&_svg:not([class*=size-])]:size-4"
        aria-hidden="true"
      >
        {icon}
      </span>
      <span>
        <Text className="text-xs text-muted">{label}</Text>
        <Text className="text-sm font-medium">{value}</Text>
      </span>
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
