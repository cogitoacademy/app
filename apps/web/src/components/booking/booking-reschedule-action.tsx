"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { IconCalendarEvent } from "@tabler/icons-react";
import { Button } from "@cogito-app/ui/components/selia/button";
import { DatePicker } from "@cogito-app/ui/components/selia/date-picker";
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
import { toastManager } from "@cogito-app/ui/components/selia/toast";

import { getUserFacingError } from "@/lib/error-message";
import { orpc } from "@/utils/orpc";
import {
  addMinutesToTime,
  isValidMinuteTime,
  MinuteTimeInput,
} from "./minute-time-input";

const TEXTAREA_CLASS =
  "min-h-28 w-full resize-y rounded-lg border border-input-border bg-background px-3 py-2 text-foreground outline-none transition-colors placeholder:text-dimmed focus:border-input-accent-border";

export function canProposeBookingReschedule({
  viewerRole,
  isBookingProposer,
  currentState,
}: {
  viewerRole: string;
  isBookingProposer: boolean;
  currentState: string;
}) {
  return (
    (viewerRole === "tutor" || isBookingProposer) &&
    [
      "awaiting_tutor_review",
      "confirmed",
      "scheduled",
      "awaiting_admin_room_approval",
      "reschedule_proposed",
    ].includes(currentState)
  );
}

export function BookingRescheduleAction({
  bookingId,
  onBookingChanged,
}: {
  bookingId: string;
  onBookingChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");
  const [reason, setReason] = useState("");
  const propose = useMutation(
    orpc.booking.proposeReschedule.mutationOptions({
      onSuccess: () => {
        setOpen(false);
        toastManager.add({
          title: "New time proposed",
          description: "The original time stays active until everyone accepts.",
          type: "success",
        });
        onBookingChanged();
      },
      onError: (error: Error) =>
        toastManager.add({
          title: "Reschedule proposal failed",
          description: getUserFacingError(
            error,
            "The new time could not be proposed.",
          ),
          type: "error",
        }),
    }),
  );

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        <IconCalendarEvent /> Propose new time
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogPopup>
          <DialogHeader className="flex-col items-start gap-1.5">
            <DialogTitle>Propose a new time</DialogTitle>
            <DialogDescription>
              The original schedule stays active until the tutor and every
              active student accept.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <Field>
              <FieldLabel htmlFor="reschedule-date">New date</FieldLabel>
              <DatePicker
                id="reschedule-date"
                value={newDate}
                minDate={new Date().toISOString().slice(0, 10)}
                placeholder="Pick the proposed date"
                onChange={setNewDate}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="reschedule-time">New start time</FieldLabel>
              <MinuteTimeInput
                id="reschedule-time"
                value={newTime}
                onChange={setNewTime}
              />
              <FieldDescription>
                Fixed 90 minutes · ends at {addMinutesToTime(newTime, 90)} WIB
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="reschedule-reason">
                Reason (optional)
              </FieldLabel>
              <textarea
                id="reschedule-reason"
                className={TEXTAREA_CLASS}
                value={reason}
                maxLength={2_000}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Explain why this session needs a new time."
              />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setOpen(false)}
              disabled={propose.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() =>
                propose.mutate({
                  bookingId,
                  proposedStartAt: new Date(`${newDate}T${newTime}:00+07:00`),
                  reason: reason.trim() || undefined,
                })
              }
              progress={propose.isPending}
              disabled={
                !newDate || !isValidMinuteTime(newTime) || propose.isPending
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
