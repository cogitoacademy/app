"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconAlertTriangle,
  IconCalendarEvent,
  IconMessage,
  IconNotes,
} from "@tabler/icons-react";
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
import { Input } from "@cogito-app/ui/components/selia/input";
import {
  getSelectItemValue,
  Select,
  SelectItem,
  SelectList,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@cogito-app/ui/components/selia/select";
import { Text } from "@cogito-app/ui/components/selia/text";
import { toastManager } from "@cogito-app/ui/components/selia/toast";

import { formatBookingDate } from "./booking-ui";
import { orpc } from "@/utils/orpc";

const BOOKING_TIMEZONE = "Asia/Jakarta";
const TEXTAREA_CLASS =
  "min-h-28 w-full resize-y rounded-lg border border-input-border bg-background px-3 py-2 text-foreground outline-none transition-colors placeholder:text-dimmed focus:border-input-accent-border";

type DialogKind = "report" | "reschedule" | null;
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
  scheduledStartAt,
  timezone,
  proposedStartAt,
  proposedEndAt,
  onBookingChanged,
}: {
  bookingId: string;
  viewerRole: string;
  currentState: string;
  scheduledStartAt: string | Date;
  timezone?: string;
  proposedStartAt?: string | Date;
  proposedEndAt?: string | Date;
  onBookingChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [supportCategory, setSupportCategory] =
    useState<SupportCategory>("tutor_late");
  const [description, setDescription] = useState("");
  const [newStartAt, setNewStartAt] = useState("");
  const [newEndAt, setNewEndAt] = useState("");
  const [rescheduleReason, setRescheduleReason] = useState("");
  const [note, setNote] = useState("");

  const isTutor = viewerRole === "tutor";
  const isStudent = viewerRole === "student";
  const isCompleted = currentState === "completed";
  const canProposeReschedule =
    isTutor && ["confirmed", "scheduled"].includes(currentState);
  const canDecideReschedule =
    isStudent && currentState === "reschedule_proposed";
  const canReportLateness =
    isStudent &&
    currentState === "scheduled" &&
    Date.now() >= new Date(scheduledStartAt).getTime() + 15 * 60_000;

  const notesQuery = useQuery({
    ...orpc.booking.getSessionNotes.queryOptions({ input: { bookingId } }),
    enabled: isCompleted,
  });

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
  const propose = useMutation(
    orpc.tutorActions.proposeReschedule.mutationOptions({
      onSuccess: () => {
        setDialog(null);
        setNewStartAt("");
        setNewEndAt("");
        setRescheduleReason("");
        toastManager.add({ title: "Reschedule proposed", type: "success" });
        onBookingChanged();
      },
      onError: (error: Error) =>
        showMutationError("Reschedule could not be proposed", error),
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

  const hasActions =
    canProposeReschedule || canDecideReschedule || canReportLateness;
  const decisionPending = accept.isPending || reject.isPending;

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
          {canDecideReschedule ? (
            <CardBody className="space-y-3">
              <Text className="font-medium">
                Your tutor proposed a new time
              </Text>
              {proposedStartAt && proposedEndAt ? (
                <Text className="text-muted">
                  {formatBookingDate(proposedStartAt, timezone)} until{" "}
                  {new Intl.DateTimeFormat("en-GB", {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: timezone ?? BOOKING_TIMEZONE,
                  }).format(new Date(proposedEndAt))}
                </Text>
              ) : (
                <Text className="text-muted">
                  Review the proposed schedule and choose whether to continue.
                </Text>
              )}
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
            {canProposeReschedule ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setDialog("reschedule")}
              >
                <IconCalendarEvent /> Propose new time
              </Button>
            ) : null}
            {canDecideReschedule ? (
              <>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => reject.mutate({ bookingId })}
                  progress={reject.isPending}
                  disabled={decisionPending}
                >
                  Reject
                </Button>
                <Button
                  size="sm"
                  onClick={() => accept.mutate({ bookingId })}
                  progress={accept.isPending}
                  disabled={decisionPending}
                >
                  Accept new time
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
              <textarea
                id="session-note"
                className={TEXTAREA_CLASS}
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
              <textarea
                id="support-description"
                className={TEXTAREA_CLASS}
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

      <Dialog
        open={dialog === "reschedule"}
        onOpenChange={(open) => !open && setDialog(null)}
      >
        <DialogPopup>
          <DialogHeader className="flex-col items-start gap-1.5">
            <DialogTitle>Propose a new time</DialogTitle>
            <DialogDescription>
              The student must accept this proposal before the schedule changes.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <Field>
              <FieldLabel htmlFor="reschedule-start">New start</FieldLabel>
              <Input
                id="reschedule-start"
                type="datetime-local"
                value={newStartAt}
                onChange={(event) => setNewStartAt(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="reschedule-end">New end</FieldLabel>
              <Input
                id="reschedule-end"
                type="datetime-local"
                value={newEndAt}
                onChange={(event) => setNewEndAt(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="reschedule-reason">
                Reason (optional)
              </FieldLabel>
              <textarea
                id="reschedule-reason"
                className={TEXTAREA_CLASS}
                value={rescheduleReason}
                maxLength={2_000}
                onChange={(event) => setRescheduleReason(event.target.value)}
                placeholder="Explain why this session needs a new time."
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setDialog(null)}
              disabled={propose.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() =>
                propose.mutate({
                  bookingId,
                  proposedStartAt: parseJakartaDateTime(newStartAt),
                  proposedEndAt: parseJakartaDateTime(newEndAt),
                  reason: rescheduleReason.trim() || undefined,
                })
              }
              progress={propose.isPending}
              disabled={
                !isValidSchedule(newStartAt, newEndAt) || propose.isPending
              }
            >
              Send proposal
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
}

function parseJakartaDateTime(value: string) {
  return new Date(`${value}:00+07:00`);
}

function isValidSchedule(start: string, end: string) {
  if (!start || !end) return false;
  const startDate = parseJakartaDateTime(start);
  const endDate = parseJakartaDateTime(end);
  return startDate.getTime() > Date.now() && endDate > startDate;
}

function showMutationError(title: string, error: Error) {
  const description = error.message.toLowerCase().includes("input validation")
    ? "Check the form fields and try again."
    : error.message;
  toastManager.add({ title, description, type: "error" });
}
