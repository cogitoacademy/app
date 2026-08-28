"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconArrowUpRight,
  IconCalendarCheck,
  IconCalendarClock,
  IconCalendarEvent,
  IconCheck,
  IconClock,
  IconCoins,
  IconDeviceLaptop,
  IconInfoCircle,
  IconLink,
  IconMapPin,
  IconSend,
  IconUserCheck,
  IconUserPlus,
  IconUsers,
  IconX,
} from "@tabler/icons-react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@cogito-app/ui/components/selia/avatar";
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
import { Divider } from "@cogito-app/ui/components/selia/divider";
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

import { EmptyState } from "@/components/empty-state";
import { InfoPreview } from "@/components/info-preview";
import { getUserFacingError } from "@/lib/error-message";
import {
  canCancelBooking,
  formatBookingDate,
  formatBookingDateOnly,
  formatBookingTimeRange,
  getBookingStateDescription,
  getBookingStateLabel,
  getBookingStateVariant,
  getBookingTypeLabel,
} from "./booking-ui";
import { BookingLifecycleActions } from "./booking-lifecycle-actions";
import {
  BOOKING_DEADLINE_STATES,
  BookingDeadlineNotice,
} from "./booking-deadline-notice";
import {
  BookingRescheduleAction,
  canProposeBookingReschedule,
} from "./booking-reschedule-action";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { orpc } from "@/utils/orpc";
import { ContactRequestPanel } from "./contact-request-panel";
import { ManualMeetingLinkDialog } from "./manual-meeting-link-dialog";

const COGITO_MARK_SRC = "/cogito-mark.png";

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
  const [manualLinkDialogOpen, setManualLinkDialogOpen] = useState(false);
  const isTutor = viewerRole === "tutor";
  const isAdmin = viewerRole === "admin";
  const bookingsPath = "/bookings";
  const bookingsLabel = isTutor ? "Tutor bookings" : "Bookings";
  const bookingQuery = useQuery({
    ...orpc.booking.get.queryOptions({ input: { bookingId } }),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (
        data &&
        BOOKING_DEADLINE_STATES.has(data.currentState) &&
        data.deadlineAt
      ) {
        return 30_000;
      }
      if (data?.modality !== "online" || data.meetingStatus === "ready") {
        return false;
      }
      return data.meeting?.status === "manual" ? 60_000 : 30_000;
    },
  });

  function refreshBookingQueries() {
    void Promise.all([
      queryClient.invalidateQueries({
        queryKey: orpc.booking.get.queryKey({ input: { bookingId } }),
      }),
      queryClient.invalidateQueries({
        queryKey: orpc.booking.listMine.key(),
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
          description: getUserFacingError(error),
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
          description: getUserFacingError(error),
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
          description: getUserFacingError(error),
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
        toastManager.add({
          title: "Session could not be completed",
          description: getUserFacingError(error),
          type: "error",
        }),
    }),
  );
  const setMeetingLink = useMutation(
    orpc.tutorActions.setMeetingLink.mutationOptions({
      onSuccess: () => {
        setManualLinkDialogOpen(false);
        toastManager.add({
          title: "Meeting link saved",
          description: "The student can now open the session link.",
          type: "success",
        });
        refreshBookingQueries();
      },
      onError: (error: Error) =>
        toastManager.add({
          title: "Meeting link could not be saved",
          description: getUserFacingError(error),
          type: "error",
        }),
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
            {getUserFacingError(
              bookingQuery.error,
              "This booking could not be loaded.",
            )}
          </Text>
          <div className="mt-5 flex gap-2">
            <Button
              variant="secondary"
              onClick={() => void bookingQuery.refetch()}
            >
              Try again
            </Button>
            <Button
              variant="underline"
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
  const canCancel =
    !isTutor &&
    !isAdmin &&
    canCancelBooking(booking.currentState, booking.scheduledStartAt);
  const canSetManualLink =
    isTutor &&
    booking.modality === "online" &&
    (booking.currentState === "confirmed" ||
      booking.currentState === "scheduled") &&
    (!booking.meetingUrl || booking.meeting?.provider === "manual");
  const sessionHasEnded =
    new Date(booking.scheduledEndAt).getTime() <= Date.now();
  const tutorActionPending =
    accept.isPending ||
    decline.isPending ||
    complete.isPending ||
    setMeetingLink.isPending;
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
      pendingStartAt={activeRescheduleProposal?.proposedStartAt}
      onBookingChanged={refreshBookingQueries}
    />
  ) : null;
  const lifecycleActionProps = {
    bookingId,
    viewerId,
    viewerRole,
    currentState: booking.currentState,
    bookingType: booking.type,
    scheduledStartAt: booking.scheduledStartAt,
    timezone: booking.timezone,
    participantRole: viewerParticipant?.role,
    participantState: viewerParticipant?.confirmationState,
    isBookingProposer: booking.proposerId === viewerId,
    pendingInvitees: booking.participants
      .filter(
        (participant) =>
          participant.role === "invitee" &&
          participant.confirmationState === "pending",
      )
      .map((participant) => ({
        userId: participant.userId,
        name: participant.user?.name ?? "Participant",
      })),
    perStudentMarks: booking.priceSnapshot?.perStudent,
    activeProposalId: activeRescheduleProposal?.id,
    isRescheduleProposer: activeRescheduleProposal?.proposedBy === viewerId,
    viewerRescheduleDecision,
    proposedStartAt: activeRescheduleProposal?.proposedStartAt,
    proposedEndAt: activeRescheduleProposal?.proposedEndAt,
    rescheduleReason: activeRescheduleProposal?.reason ?? undefined,
    onBookingChanged: refreshBookingQueries,
  };

  const meetingUrl = booking.meetingUrl;

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
      <header className="border-b border-border pb-6">
        <Button
          variant="underline"
          size="sm"
          render={
            <Link to={bookingsPath} aria-label={`Back to ${bookingsLabel}`} />
          }
          nativeButton={false}
          className="mb-3"
        >
          <IconArrowLeft /> Back to {bookingsLabel.toLowerCase()}
        </Button>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch sm:justify-between">
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
            <BookingDeadlineNotice
              currentState={booking.currentState}
              deadlineAt={booking.deadlineAt}
              timezone={booking.timezone}
            />
          </div>
          <div className="flex flex-col items-start gap-3 sm:items-end sm:justify-between">
            <Badge variant={getBookingStateVariant(booking.currentState)} pill>
              {getBookingStateLabel(booking.currentState)}
            </Badge>
            {canReview || canCancel || canProposeReschedule || canComplete ? (
              <div
                className="flex w-full flex-col gap-2 sm:mt-auto sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end"
                role="group"
                aria-label="Booking actions"
              >
                {rescheduleAction}
                {canReview ? (
                  <>
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
                  </>
                ) : canCancel ? (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={requestCancellation}
                    progress={cancel.isPending}
                    disabled={cancel.isPending}
                  >
                    Cancel booking
                  </Button>
                ) : null}
                {canComplete ? (
                  <div className="flex min-w-0 flex-col items-start gap-2 sm:items-end">
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        onClick={completeSession}
                        progress={complete.isPending}
                        disabled={!sessionHasEnded || tutorActionPending}
                      >
                        Complete session
                      </Button>
                      <InfoPreview
                        title="Completion timing"
                        description={
                          sessionHasEnded
                            ? "Confirm completion to settle the held Marks."
                            : "Completion becomes available after the scheduled end time."
                        }
                        label="About completing this session"
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div className="grid w-full min-w-0 grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,36rem)]">
        <div className="contents lg:col-start-1 lg:flex lg:flex-col lg:gap-4">
          <Card className="order-1 min-w-0 overflow-hidden lg:order-none">
            <CardHeader>
              <CardTitle>Session overview</CardTitle>
              <CardDescription>
                When, how, and who for this booking.
              </CardDescription>
            </CardHeader>
            <CardBody className="space-y-6">
              <section
                aria-labelledby="session-when-title"
                className="grid gap-5 sm:grid-cols-2"
              >
                <DetailField
                  icon={<IconCalendarClock />}
                  label="Date & time"
                  value={
                    <span className="inline-flex flex-wrap items-center gap-x-2">
                      <span>
                        {formatBookingDateOnly(
                          booking.scheduledStartAt,
                          booking.timezone,
                        )}
                      </span>
                      <span className="text-dimmed" aria-hidden="true">
                        ·
                      </span>
                      <span>
                        {formatBookingTimeRange(
                          booking.scheduledStartAt,
                          booking.scheduledEndAt,
                          booking.timezone,
                        )}
                      </span>
                    </span>
                  }
                />
                <div className="flex min-w-0 flex-wrap items-start gap-3">
                  <IconBox variant="tertiary" size="md" aria-hidden="true">
                    {booking.modality === "online" ? (
                      <IconDeviceLaptop />
                    ) : (
                      <IconMapPin />
                    )}
                  </IconBox>
                  <div className="min-w-0 flex-1">
                    <Text
                      id="session-access-title"
                      className="text-sm text-muted"
                    >
                      Format & access
                    </Text>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2">
                      <Text className="font-medium text-base/5">
                        {booking.modality === "online" ? "Online" : "Offline"}
                      </Text>
                      {booking.modality === "online" ? (
                        <MeetingStatusPopover
                          bookingState={booking.currentState}
                          meetingStatus={booking.meetingStatus}
                          providerStatus={booking.meeting?.status}
                          meetingUrl={meetingUrl}
                          canSetManualLink={canSetManualLink}
                          onSetManualLink={() => setManualLinkDialogOpen(true)}
                          manualLinkPending={setMeetingLink.isPending}
                        />
                      ) : !activeRoomBooking ? (
                        <InfoPreview
                          title="Room details"
                          description="Room details are not available yet."
                          label="About room details"
                        />
                      ) : null}
                    </div>
                    {booking.modality === "offline" && activeRoomBooking ? (
                      <>
                        <Text className="mt-1 font-medium">
                          {activeRoomBooking.room.name}
                        </Text>
                        <Text className="mt-0.5 break-words text-sm text-muted">
                          {activeRoomBooking.room.location}
                        </Text>
                      </>
                    ) : null}
                  </div>
                </div>
                <span id="session-when-title" className="sr-only">
                  When
                </span>
              </section>

              <Divider aria-hidden="true" />

              <section
                aria-labelledby="participants-title"
                className="space-y-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <IconBox variant="tertiary" size="md" aria-hidden="true">
                      <IconUsers />
                    </IconBox>
                    <div className="min-w-0">
                      <Text id="participants-title" className="font-medium">
                        Participants
                      </Text>
                      <Text className="text-sm text-muted">
                        {booking.confirmedHeadcount} of{" "}
                        {booking.targetGroupSize} confirmed
                      </Text>
                    </div>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  {booking.participants.length > 0 ? (
                    booking.participants.map((participant) => (
                      <Item
                        key={participant.id}
                        variant="plain"
                        size="sm"
                        className="min-w-0 items-center rounded-lg border border-item-border bg-item p-3!"
                      >
                        <ItemMedia>
                          <Avatar size="sm">
                            {participant.user?.image ? (
                              <AvatarImage
                                src={participant.user.image}
                                alt={
                                  (participant.user?.name ?? "Participant") +
                                  " avatar"
                                }
                              />
                            ) : null}
                            <AvatarFallback>
                              {participant.user?.name
                                .slice(0, 2)
                                .toUpperCase() ?? "CG"}
                            </AvatarFallback>
                          </Avatar>
                        </ItemMedia>
                        <ItemContent className="min-w-0 flex-1">
                          <ItemTitle className="truncate text-sm">
                            {participant.user?.name ?? "Participant"}
                          </ItemTitle>
                          <ItemDescription className="truncate text-xs capitalize">
                            {participant.role} ·{" "}
                            {participant.confirmationState.replaceAll("_", " ")}
                          </ItemDescription>
                        </ItemContent>
                      </Item>
                    ))
                  ) : (
                    <EmptyState
                      icon={<IconUsers />}
                      title="No participants yet"
                      description="The booking roster will appear here when participants are added."
                      size="inline"
                      className="sm:col-span-2 rounded-lg border border-item-border"
                    />
                  )}
                </div>
              </section>
            </CardBody>
          </Card>

          {!isTutor &&
          !isAdmin &&
          booking.currentState === "completed" &&
          booking.targetGroupSize > 1 ? (
            <div className="order-1 min-w-0 lg:order-none">
              <ContactRequestPanel bookingId={bookingId} />
            </div>
          ) : null}

          {booking.type === "series" ? (
            <Card className="order-1 min-w-0 overflow-hidden lg:order-none">
              <CardHeader>
                <CardTitle>Series sessions</CardTitle>
                <CardDescription>
                  Each session is completed individually to settle its held
                  Marks.
                </CardDescription>
              </CardHeader>
              <CardBody className="grid gap-3">
                {sessionsQuery.isPending ? (
                  <Text className="text-muted">Loading series sessions…</Text>
                ) : sessionsQuery.isError ? (
                  <EmptyState
                    icon={<IconCalendarEvent />}
                    title="Series sessions unavailable"
                    description="The session list could not be loaded. Please try again."
                    tone="danger"
                    size="inline"
                    action={
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => void sessionsQuery.refetch()}
                      >
                        Try again
                      </Button>
                    }
                  />
                ) : sessionsQuery.data && sessionsQuery.data.length > 0 ? (
                  sessionsQuery.data.map((session) => {
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
                  })
                ) : (
                  <EmptyState
                    icon={<IconCalendarEvent />}
                    title="No series sessions yet"
                    description="Sessions will appear here once this booking is scheduled."
                    size="inline"
                  />
                )}
              </CardBody>
            </Card>
          ) : null}

          <div className="order-3 grid min-w-0 gap-4 lg:order-none">
            {!isAdmin ? (
              <BookingLifecycleActions
                {...lifecycleActionProps}
                section="supplementary"
              />
            ) : null}

            <Card className="min-w-0 overflow-hidden">
              <CardHeader>
                <CardTitle>Activity</CardTitle>
                <CardDescription>
                  A chronological record of this booking
                </CardDescription>
              </CardHeader>
              <CardBody className="px-6">
                {history.length > 0 ? (
                  <ol aria-label="Booking activity" className="relative">
                    {history.map((entry) => (
                      <ActivityTimelineItem
                        key={entry.id}
                        entry={entry}
                        timeZone={booking.timezone}
                        isLast={entry.id === history[history.length - 1]?.id}
                      />
                    ))}
                  </ol>
                ) : (
                  <EmptyState
                    icon={<IconClock />}
                    title="No activity yet"
                    description="Booking updates will appear here."
                    size="inline"
                  />
                )}
              </CardBody>
            </Card>
          </div>
        </div>

        <aside className="order-2 grid min-w-0 gap-4 lg:order-none lg:col-start-2 lg:row-start-1 lg:sticky lg:top-4">
          {!isAdmin ? (
            <BookingLifecycleActions
              {...lifecycleActionProps}
              section="actions"
            />
          ) : null}
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
                value={<MarkAmount value={booking.originalMarks} />}
              />
              <SummaryRow
                label="Currently held"
                value={<MarkAmount value={booking.holdAmount} />}
              />
              <SummaryRow
                label="Refunded"
                value={<MarkAmount value={booking.refundedAmount} />}
              />
              {booking.priceSnapshot ? (
                <SummaryRow
                  label="Per participant"
                  value={
                    <MarkAmount value={booking.priceSnapshot.perStudent} />
                  }
                />
              ) : null}
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
                    variant="primary-subtle"
                    size="sm"
                    aria-hidden="true"
                  >
                    <IconCalendarEvent />
                  </IconBox>
                  <div className="min-w-0">
                    <Text className="text-sm text-muted">Session details</Text>
                    <Text className="font-medium">
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
      <ManualMeetingLinkDialog
        open={manualLinkDialogOpen}
        onOpenChange={setManualLinkDialogOpen}
        onSubmit={(url) => setMeetingLink.mutate({ bookingId, url })}
        pending={setMeetingLink.isPending}
        initialUrl={meetingUrl}
        actor="tutor"
      />
    </Stack>
  );
}

type BookingActivityEntry = {
  id: string;
  fromState: string | null;
  toState: string;
  reason: string | null;
  actorType: string;
  createdAt: string | Date;
};

function ActivityTimelineItem({
  entry,
  timeZone,
  isLast,
}: {
  entry: BookingActivityEntry;
  timeZone: string;
  isLast: boolean;
}) {
  return (
    <li className="relative flex gap-3 pb-6 last:pb-0">
      {!isLast ? (
        <span
          aria-hidden="true"
          className="absolute bottom-0 left-3.5 top-8 w-px bg-border"
        />
      ) : null}
      <IconBox
        variant={getActivityIconVariant(entry.toState)}
        size="sm"
        circle
        className="relative z-10"
        aria-hidden="true"
      >
        {getActivityIcon(entry.toState)}
      </IconBox>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
              <Text className="font-semibold">
                {getActivityActionLabel(entry.toState)}
              </Text>
              <Text className="text-sm text-muted">by</Text>
              <Badge
                variant={getActivityActorVariant(entry.actorType)}
                size="sm"
                pill
              >
                {formatActivityActor(entry.actorType)}
              </Badge>
              <Text className="text-sm text-dimmed">·</Text>
              <Badge
                variant={getBookingStateVariant(entry.toState)}
                size="sm"
                pill
              >
                {getBookingStateLabel(entry.toState)}
              </Badge>
              {entry.fromState ? (
                <Text className="text-sm text-dimmed">
                  from {getBookingStateLabel(entry.fromState)}
                </Text>
              ) : null}
            </div>
          </div>
          <time
            dateTime={new Date(entry.createdAt).toISOString()}
            className="shrink-0 text-xs text-dimmed"
          >
            {formatActivityTimestamp(entry.createdAt, timeZone)}
          </time>
        </div>
        {entry.reason ? (
          <div className="mt-3 rounded-lg border border-border/70 bg-accent/50 px-3 py-2">
            <Text className="text-xs font-medium text-muted">Note</Text>
            <Text className="mt-1 break-words text-sm text-muted">
              {entry.reason}
            </Text>
          </div>
        ) : null}
      </div>
    </li>
  );
}

function getActivityActionLabel(state: string) {
  const labels: Record<string, string> = {
    awaiting_participant_confirmation: "Invite participants",
    awaiting_tutor_review: "Submit booking",
    awaiting_reconfirmation: "Request reconfirmation",
    awaiting_admin_room_approval: "Request room assignment",
    confirmed: "Approve booking",
    scheduled: "Schedule session",
    reschedule_proposed: "Propose reschedule",
    completed: "Complete session",
    declined: "Decline booking",
    cancelled: "Cancel booking",
    late_cancelled: "Late-cancel booking",
    no_show: "Mark no-show",
    expired: "Expire booking",
  };
  return labels[state] ?? "Update booking";
}

function formatActivityActor(actorType: string) {
  return actorType.charAt(0).toUpperCase() + actorType.slice(1);
}

function getActivityActorVariant(
  actorType: string,
): "primary" | "secondary" | "tertiary" | "info" | "warning" {
  if (actorType === "tutor") return "info";
  if (actorType === "admin") return "warning";
  if (actorType === "system") return "tertiary";
  return "secondary";
}

function getActivityIconVariant(
  state: string,
):
  | "success-subtle"
  | "danger-subtle"
  | "warning-subtle"
  | "info-subtle"
  | "secondary-subtle" {
  if (["confirmed", "completed"].includes(state)) {
    return "success-subtle";
  }
  if (
    ["declined", "cancelled", "late_cancelled", "no_show", "expired"].includes(
      state,
    )
  ) {
    return "danger-subtle";
  }
  if (state.startsWith("awaiting") || state === "reschedule_proposed") {
    return "warning-subtle";
  }
  if (state === "scheduled") return "info-subtle";
  return "secondary-subtle";
}

function getActivityIcon(state: string) {
  switch (state) {
    case "awaiting_participant_confirmation":
      return <IconUserPlus />;
    case "awaiting_tutor_review":
      return <IconSend />;
    case "awaiting_reconfirmation":
      return <IconUserCheck />;
    case "awaiting_admin_room_approval":
      return <IconMapPin />;
    case "confirmed":
      return <IconUserCheck />;
    case "scheduled":
      return <IconCalendarCheck />;
    case "reschedule_proposed":
      return <IconCalendarClock />;
    case "completed":
      return <IconCheck />;
    case "declined":
    case "cancelled":
    case "late_cancelled":
      return <IconX />;
    case "no_show":
      return <IconAlertTriangle />;
    case "expired":
      return <IconClock />;
    default:
      return <IconClock />;
  }
}

function formatActivityTimestamp(value: string | Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(value));
}

function MeetingStatusPopover({
  bookingState,
  meetingStatus,
  providerStatus,
  meetingUrl,
  canSetManualLink = false,
  onSetManualLink,
  manualLinkPending = false,
}: {
  bookingState: string;
  meetingStatus: string;
  providerStatus?: string | null;
  meetingUrl?: string | null;
  canSetManualLink?: boolean;
  onSetManualLink?: () => void;
  manualLinkPending?: boolean;
}) {
  const requiresAttention =
    !meetingUrl && (meetingStatus === "failed" || providerStatus === "manual");
  const title = getMeetingStatusTitle({
    bookingState,
    meetingStatus,
    providerStatus,
    meetingUrl,
  });
  const description = getMeetingStatusDescription({
    bookingState,
    meetingStatus,
    providerStatus,
    meetingUrl,
  });
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <InfoPreview
        title={title}
        description={description}
        tone={meetingUrl ? "success" : requiresAttention ? "warning" : "info"}
        label={`About meeting status: ${title}`}
      >
        {meetingUrl ? (
          <Button
            render={
              <a
                href={meetingUrl}
                target="_blank"
                rel="noreferrer"
                aria-label="Open meeting room"
              />
            }
            nativeButton={false}
            variant="tertiary"
            size="xs"
            block
          >
            <IconDeviceLaptop aria-hidden="true" />
            Open meeting room
            <IconArrowUpRight aria-hidden="true" />
          </Button>
        ) : meetingStatus === "failed" ? (
          <Badge variant="warning" size="sm" pill>
            Retrying automatically
          </Badge>
        ) : providerStatus === "manual" ? (
          <Badge variant="warning" size="sm" pill>
            Manual link needed
          </Badge>
        ) : null}
      </InfoPreview>
      {canSetManualLink && onSetManualLink ? (
        <Button
          variant="outline"
          size="xs"
          onClick={onSetManualLink}
          progress={manualLinkPending}
          disabled={manualLinkPending}
        >
          <IconLink aria-hidden="true" />
          {meetingUrl ? "Replace link" : "Add meeting link"}
        </Button>
      ) : null}
    </div>
  );
}

function getMeetingStatusTitle({
  bookingState,
  meetingStatus,
  providerStatus,
  meetingUrl,
}: {
  bookingState: string;
  meetingStatus: string;
  providerStatus?: string | null;
  meetingUrl?: string | null;
}) {
  if (meetingUrl) return "Meeting room available";
  if (meetingStatus === "failed") {
    return "Meeting link creation needs attention";
  }
  if (providerStatus === "manual") return "Meeting link pending manual setup";
  if (bookingState === "confirmed") return "Preparing your meeting link";
  return "Meeting link will appear here";
}

function getMeetingStatusDescription({
  bookingState,
  meetingStatus,
  providerStatus,
  meetingUrl,
}: {
  bookingState: string;
  meetingStatus: string;
  providerStatus?: string | null;
  meetingUrl?: string | null;
}) {
  if (meetingUrl) {
    return "The meeting room is available for this session.";
  }
  if (meetingStatus === "failed") {
    return "Google Meet creation failed. The system will retry automatically every 5 minutes, then let the tutor or an admin add a manual link if needed.";
  }
  if (providerStatus === "manual") {
    return "A tutor or admin needs to add a meeting URL before the session. This can happen when the automatic meeting provider is unavailable.";
  }
  if (bookingState === "confirmed") {
    return "The booking is confirmed and the link is being generated. This page refreshes automatically while it is being prepared.";
  }
  return "The link is generated after the tutor accepts the booking and all required confirmations are complete.";
}

function DetailField({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <IconBox variant="tertiary" size="md">
        {icon}
      </IconBox>
      <div>
        <Text className="text-sm text-muted">{label}</Text>
        <Text className="font-medium text-base/5">{value}</Text>
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
      <IconBox variant="primary-subtle" size="sm" aria-hidden="true">
        {icon}
      </IconBox>
      <span>
        <Text className="text-sm text-muted">{label}</Text>
        <Text className="text-sm font-medium">{value}</Text>
      </span>
    </div>
  );
}

function SummaryRow({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <Text className="text-muted">{label}</Text>
      <Text className="font-medium">{value}</Text>
    </div>
  );
}

function MarkAmount({ value }: { value: number }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap"
      aria-label={`${value} Marks`}
    >
      <img
        src={COGITO_MARK_SRC}
        alt=""
        aria-hidden="true"
        width={16}
        height={16}
        className="size-4 shrink-0 object-contain"
      />
      <span>{value}</span>
    </span>
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
