"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconAlertTriangle,
  IconCalendarEvent,
  IconMessage,
  IconNotes,
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
  Field,
  FieldDescription,
  FieldLabel,
} from "@cogito-app/ui/components/selia/field";
import { IconBox } from "@cogito-app/ui/components/selia/icon-box";
import {
  getSelectItemValue,
  Select,
  SelectItem,
  SelectList,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@cogito-app/ui/components/selia/select";
import { Textarea } from "@cogito-app/ui/components/selia/textarea";
import { Text } from "@cogito-app/ui/components/selia/text";
import { toastManager } from "@cogito-app/ui/components/selia/toast";

import { formatBookingDate, formatBookingTimeRange } from "./booking-ui";
import { getUserFacingError } from "@/lib/error-message";
import { orpc } from "@/utils/orpc";

type DialogKind = "report" | "decline-invite" | null;
type SupportCategory =
  | "tutor_late"
  | "tutor_no_show"
  | "technical"
  | "payment"
  | "other";

export function BookingLifecycleActions({
  bookingId,
  viewerRole,
  currentState,
  bookingType,
  scheduledStartAt,
  timezone,
  participantRole,
  participantState,
  perStudentMarks,
  proposedStartAt,
  proposedEndAt,
  activeProposalId,
  isRescheduleProposer,
  viewerRescheduleDecision,
  rescheduleReason,
  onBookingChanged,
}: {
  bookingId: string;
  viewerRole: string;
  currentState: string;
  bookingType: string;
  scheduledStartAt: string | Date;
  timezone?: string;
  participantRole?: string;
  participantState?: string;
  perStudentMarks?: number;
  proposedStartAt?: string | Date;
  proposedEndAt?: string | Date;
  activeProposalId?: string;
  isRescheduleProposer?: boolean;
  viewerRescheduleDecision?: "pending" | "accepted" | "rejected";
  rescheduleReason?: string;
  onBookingChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [supportCategory, setSupportCategory] =
    useState<SupportCategory>("tutor_late");
  const [description, setDescription] = useState("");
  const [inviteDeclineReason, setInviteDeclineReason] = useState("");
  const [note, setNote] = useState("");

  const isStudent = viewerRole === "student";
  const isCompleted = currentState === "completed";
  const canDecideReschedule =
    currentState === "reschedule_proposed" &&
    Boolean(activeProposalId) &&
    viewerRescheduleDecision === "pending";
  const hasPendingReschedule =
    currentState === "reschedule_proposed" && Boolean(activeProposalId);
  const canReportLateness =
    isStudent &&
    ["scheduled", "no_show"].includes(currentState) &&
    Date.now() >= new Date(scheduledStartAt).getTime() + 15 * 60_000;
  const canRespondToInvite =
    isStudent &&
    bookingType === "group" &&
    currentState === "awaiting_participant_confirmation" &&
    participantRole === "invitee" &&
    participantState === "pending";
  const canReconfirm =
    isStudent &&
    currentState === "awaiting_reconfirmation" &&
    ["confirmed", "reconfirmed"].includes(participantState ?? "") &&
    participantState !== "reconfirmed";

  const notesQuery = useQuery({
    ...orpc.booking.getSessionNotes.queryOptions({ input: { bookingId } }),
    enabled: isCompleted,
  });
  const ticketsQuery = useQuery({
    ...orpc.support.listTickets.queryOptions({ input: { limit: 50 } }),
    enabled: isStudent,
  });
  const bookingTickets =
    ticketsQuery.data?.filter((ticket) => ticket.bookingId === bookingId) ?? [];

  function refreshNotes() {
    void queryClient.invalidateQueries({
      queryKey: orpc.booking.getSessionNotes.queryKey({ input: { bookingId } }),
    });
  }

  const report = useMutation(
    orpc.support.createTicket.mutationOptions({
      onSuccess: () => {
        setDialog(null);
        setDescription("");
        toastManager.add({
          title: "Report submitted",
          description: "Cogito support will review the issue.",
          type: "success",
        });
      },
      onError: (error: Error) =>
        showMutationError("Report could not be submitted", error),
    }),
  );
  const accept = useMutation(
    orpc.booking.acceptReschedule.mutationOptions({
      onSuccess: () => {
        toastManager.add({ title: "New schedule accepted", type: "success" });
        onBookingChanged();
      },
      onError: (error: Error) =>
        showMutationError("Reschedule could not be accepted", error),
    }),
  );
  const reject = useMutation(
    orpc.booking.rejectReschedule.mutationOptions({
      onSuccess: () => {
        toastManager.add({ title: "Reschedule rejected", type: "success" });
        onBookingChanged();
      },
      onError: (error: Error) =>
        showMutationError("Reschedule could not be rejected", error),
    }),
  );
  const addNote = useMutation(
    orpc.booking.addSessionNote.mutationOptions({
      onSuccess: () => {
        setNote("");
        toastManager.add({ title: "Session note added", type: "success" });
        refreshNotes();
      },
      onError: (error: Error) =>
        showMutationError("Session note could not be added", error),
    }),
  );
  const confirmInvite = useMutation(
    orpc.booking.confirmInvite.mutationOptions({
      onSuccess: () => {
        toastManager.add({
          title: "Group invitation accepted",
          type: "success",
        });
        onBookingChanged();
      },
      onError: (error: Error) =>
        showMutationError("Invitation could not be accepted", error),
    }),
  );
  const declineInvite = useMutation(
    orpc.booking.declineInvite.mutationOptions({
      onSuccess: () => {
        setDialog(null);
        setInviteDeclineReason("");
        toastManager.add({
          title: "Group invitation declined",
          type: "success",
        });
        onBookingChanged();
      },
      onError: (error: Error) =>
        showMutationError("Invitation could not be declined", error),
    }),
  );
  const reconfirm = useMutation(
    orpc.booking.reconfirm.mutationOptions({
      onSuccess: (_result, variables) => {
        toastManager.add({
          title: variables.accept ? "Booking reconfirmed" : "Booking declined",
          type: "success",
        });
        onBookingChanged();
      },
      onError: (error: Error) =>
        showMutationError("Reconfirmation could not be saved", error),
    }),
  );

  const hasActions =
    hasPendingReschedule ||
    canReportLateness ||
    canRespondToInvite ||
    canReconfirm;
  const decisionPending = accept.isPending || reject.isPending;
  const invitePending = confirmInvite.isPending || declineInvite.isPending;
  const acceptedRescheduleMessage = isRescheduleProposer
    ? bookingType === "group"
      ? "Your proposed time is waiting for the other participants."
      : `Your proposed time is waiting for the ${viewerRole === "tutor" ? "student" : "tutor"} to respond.`
    : bookingType === "group"
      ? "You accepted the new time. Waiting for the other participants."
      : `You accepted the new time. Waiting for the ${viewerRole === "tutor" ? "student" : "tutor"} to respond.`;

  return (
    <>
      {hasActions ? (
        <Card>
          <CardHeader>
            <IconBox variant="warning-subtle">
              <IconCalendarEvent />
            </IconBox>
            <CardTitle>Booking actions</CardTitle>
            <CardDescription>
              Manage schedule changes or report an issue with this session.
            </CardDescription>
          </CardHeader>
          {hasPendingReschedule ? (
            <CardBody className="space-y-3">
              <Text className="font-medium">A new time was proposed</Text>
              {proposedStartAt && proposedEndAt ? (
                <Text className="text-muted">
                  {formatBookingDate(proposedStartAt, timezone)} ·{" "}
                  {formatBookingTimeRange(
                    proposedStartAt,
                    proposedEndAt,
                    timezone,
                  )}
                </Text>
              ) : (
                <Text className="text-muted">
                  Review the proposed schedule and choose whether to continue.
                </Text>
              )}
              {rescheduleReason ? (
                <Text className="text-sm text-muted">
                  Reason: {rescheduleReason}
                </Text>
              ) : null}
              {viewerRescheduleDecision === "accepted" ? (
                <Text className="text-sm text-success">
                  {acceptedRescheduleMessage}
                </Text>
              ) : null}
              {viewerRescheduleDecision === "pending" ? (
                <Text className="text-xs text-muted">
                  Accepting records your vote. The booking time changes only
                  after every required party accepts.
                </Text>
              ) : null}
            </CardBody>
          ) : null}
          {canRespondToInvite ? (
            <CardBody className="space-y-2">
              <Text className="font-medium">
                You have been invited to this group session
              </Text>
              <Text className="text-muted">
                Accepting reserves {perStudentMarks ?? "the required"} Marks
                from your wallet.
              </Text>
            </CardBody>
          ) : null}
          {canReconfirm ? (
            <CardBody className="space-y-2">
              <Text className="font-medium">The booking details changed</Text>
              <Text className="text-muted">
                Review the updated schedule and price of{" "}
                {perStudentMarks ?? "the required"} Marks before continuing.
              </Text>
            </CardBody>
          ) : null}
          <CardFooter className="flex-wrap justify-end gap-2">
            {canReportLateness ? (
              <Button
                variant="danger"
                size="sm"
                onClick={() => setDialog("report")}
              >
                <IconAlertTriangle /> Report tutor issue
              </Button>
            ) : null}
            {canDecideReschedule ? (
              <>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() =>
                    reject.mutate({ bookingId, proposalId: activeProposalId })
                  }
                  progress={reject.isPending}
                  disabled={decisionPending}
                >
                  Reject
                </Button>
                <Button
                  size="sm"
                  onClick={() =>
                    accept.mutate({ bookingId, proposalId: activeProposalId })
                  }
                  progress={accept.isPending}
                  disabled={decisionPending}
                >
                  Accept new time
                </Button>
              </>
            ) : null}
            {canRespondToInvite ? (
              <>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setDialog("decline-invite")}
                  disabled={invitePending}
                >
                  Decline invitation
                </Button>
                <Button
                  size="sm"
                  onClick={() => confirmInvite.mutate({ bookingId })}
                  progress={confirmInvite.isPending}
                  disabled={invitePending}
                >
                  Accept invitation
                </Button>
              </>
            ) : null}
            {canReconfirm ? (
              <>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => reconfirm.mutate({ bookingId, accept: false })}
                  progress={
                    reconfirm.isPending && reconfirm.variables?.accept === false
                  }
                  disabled={reconfirm.isPending}
                >
                  Decline changes
                </Button>
                <Button
                  size="sm"
                  onClick={() => reconfirm.mutate({ bookingId, accept: true })}
                  progress={
                    reconfirm.isPending && reconfirm.variables?.accept === true
                  }
                  disabled={reconfirm.isPending}
                >
                  Reconfirm booking
                </Button>
              </>
            ) : null}
          </CardFooter>
        </Card>
      ) : null}

      {isCompleted ? (
        <Card>
          <CardHeader>
            <IconBox variant="info-subtle">
              <IconNotes />
            </IconBox>
            <CardTitle>Session notes</CardTitle>
            <CardDescription>
              Notes are shared with the student and tutor after completion.
            </CardDescription>
          </CardHeader>
          <CardBody className="space-y-4">
            {notesQuery.isPending ? (
              <Text className="text-muted">Loading session notes...</Text>
            ) : notesQuery.isError ? (
              <Text className="text-danger">
                Session notes could not be loaded.
              </Text>
            ) : notesQuery.data.length > 0 ? (
              notesQuery.data.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-border p-4"
                >
                  <div
                    className="space-y-2 text-sm [&_a]:text-info [&_a]:underline [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
                    dangerouslySetInnerHTML={{ __html: item.content }}
                  />
                  <Text className="mt-3 text-xs text-muted">
                    {formatBookingDate(item.createdAt, timezone)}
                  </Text>
                </div>
              ))
            ) : (
              <Text className="text-muted">No session notes yet.</Text>
            )}
            <Field>
              <FieldLabel htmlFor="session-note">Add a note</FieldLabel>
              <Textarea
                id="session-note"
                value={note}
                maxLength={10_000}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Share progress, follow-up topics, or useful resources."
              />
              <FieldDescription>
                Basic formatting and links are supported.
              </FieldDescription>
            </Field>
          </CardBody>
          <CardFooter className="justify-end">
            <Button
              size="sm"
              onClick={() =>
                addNote.mutate({ bookingId, content: note.trim() })
              }
              progress={addNote.isPending}
              disabled={!note.trim() || addNote.isPending}
            >
              <IconMessage /> Add note
            </Button>
          </CardFooter>
        </Card>
      ) : null}

      {bookingTickets.length > 0 ? (
        <Card>
          <CardHeader>
            <IconBox variant="warning-subtle">
              <IconAlertTriangle />
            </IconBox>
            <CardTitle>Support reports</CardTitle>
            <CardDescription>Reports linked to this booking</CardDescription>
          </CardHeader>
          <CardBody className="space-y-3">
            {bookingTickets.map((ticket) => (
              <div
                key={ticket.id}
                className="flex flex-col gap-2 rounded-lg border border-border p-4 sm:flex-row sm:items-start sm:justify-between"
              >
                <div>
                  <Text className="font-medium">
                    {ticket.category.replaceAll("_", " ")}
                  </Text>
                  <Text className="text-sm text-muted">
                    {ticket.description}
                  </Text>
                </div>
                <Badge
                  variant={ticket.status === "resolved" ? "success" : "warning"}
                >
                  {ticket.status.replaceAll("_", " ")}
                </Badge>
              </div>
            ))}
          </CardBody>
        </Card>
      ) : null}

      <Dialog
        open={dialog === "decline-invite"}
        onOpenChange={(open) => !open && setDialog(null)}
      >
        <DialogPopup>
          <DialogHeader className="flex-col items-start gap-1.5">
            <DialogTitle>Decline group invitation?</DialogTitle>
            <DialogDescription>
              You will not be included in this booking and no Marks will be
              held.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <Field>
              <FieldLabel htmlFor="invite-decline-reason">
                Reason (optional)
              </FieldLabel>
              <Textarea
                id="invite-decline-reason"
                value={inviteDeclineReason}
                maxLength={2_000}
                onChange={(event) => setInviteDeclineReason(event.target.value)}
                placeholder="Let the group know why you cannot join."
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setDialog(null)}
              disabled={declineInvite.isPending}
            >
              Keep invitation
            </Button>
            <Button
              variant="danger"
              onClick={() =>
                declineInvite.mutate({
                  bookingId,
                  reason: inviteDeclineReason.trim() || undefined,
                })
              }
              progress={declineInvite.isPending}
              disabled={declineInvite.isPending}
            >
              Decline invitation
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>

      <Dialog
        open={dialog === "report"}
        onOpenChange={(open) => !open && setDialog(null)}
      >
        <DialogPopup>
          <DialogHeader className="flex-col items-start gap-1.5">
            <DialogTitle>Report a session issue</DialogTitle>
            <DialogDescription>
              Tell Cogito support what happened. Your report will be linked to
              this booking.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <Field>
              <FieldLabel>Issue</FieldLabel>
              <Select
                value={supportCategory}
                onValueChange={(value) =>
                  setSupportCategory(
                    getSelectItemValue(value) as SupportCategory,
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectPopup>
                  <SelectList>
                    <SelectItem value="tutor_late">Tutor is late</SelectItem>
                    <SelectItem value="tutor_no_show">
                      Tutor did not show up
                    </SelectItem>
                    <SelectItem value="technical">Technical problem</SelectItem>
                    <SelectItem value="payment">
                      Marks or payment issue
                    </SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectList>
                </SelectPopup>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="support-description">
                What happened?
              </FieldLabel>
              <Textarea
                id="support-description"
                value={description}
                maxLength={2_000}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Include enough detail for the support team to investigate."
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setDialog(null)}
              disabled={report.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() =>
                report.mutate({
                  bookingId,
                  category: supportCategory,
                  description: description.trim(),
                })
              }
              progress={report.isPending}
              disabled={!description.trim() || report.isPending}
            >
              Submit report
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
}

function showMutationError(title: string, error: Error) {
  const description = getUserFacingError(
    error,
    "This booking action could not be completed.",
  );
  toastManager.add({ title, description, type: "error" });
}
