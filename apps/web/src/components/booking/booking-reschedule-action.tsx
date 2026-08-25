"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { IconCalendarEvent, IconCheck, IconClock } from "@tabler/icons-react";
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

import { EmptyState } from "@/components/empty-state";
import { getUserFacingError } from "@/lib/error-message";
import { orpc } from "@/utils/orpc";
import {
  getRescheduleProposalRoute,
  RESCHEDULE_PROPOSAL_ROUTE,
} from "./booking-reschedule-routing";
import {
  addMinutesToTime,
  isTimeWithinRange,
  isValidMinuteTime,
  MinuteTimeInput,
} from "./minute-time-input";

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
  viewerRole,
  modality,
  currentStartAt,
  onBookingChanged,
}: {
  bookingId: string;
  tutorId: string;
  viewerRole: string;
  modality: string;
  currentStartAt?: Date | string | null;
  onBookingChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"availability" | "custom">("availability");
  const [selectedSlotId, setSelectedSlotId] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");
  const [reason, setReason] = useState("");
  const proposalRoute = getRescheduleProposalRoute(viewerRole);
  const isTutor = proposalRoute === RESCHEDULE_PROPOSAL_ROUTE.tutor;
  const availabilityQuery = useQuery({
    ...orpc.booking.getRescheduleAvailability.queryOptions({
      input: { bookingId },
    }),
    enabled: open,
  });
  const availabilitySlots = availabilityQuery.data ?? [];
  const slots = availabilitySlots
    .filter(
      (slot) =>
        (slot.modality === "both" || slot.modality === modality) &&
        new Date(slot.endDate).getTime() - 90 * 60_000 > Date.now(),
    )
    .toSorted(
      (a, b) =>
        new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
    );
  const selectedSlot = slots.find((slot) => slot.id === selectedSlotId);
  const minTime = selectedSlot
    ? formatTimeValue(getEarliestStart(selectedSlot.startDate))
    : undefined;
  const maxTime = selectedSlot
    ? formatTimeValue(
        new Date(new Date(selectedSlot.endDate).getTime() - 90 * 60_000),
      )
    : undefined;
  const usingAvailability = mode === "availability";
  const validTime =
    isValidMinuteTime(newTime) &&
    (!usingAvailability || isTimeWithinRange(newTime, minTime, maxTime));
  const proposalMutationOptions = {
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
  };
  const propose = useMutation(
    proposalRoute === RESCHEDULE_PROPOSAL_ROUTE.tutor
      ? orpc.tutorActions.proposeReschedule.mutationOptions(
          proposalMutationOptions,
        )
      : orpc.booking.proposeReschedule.mutationOptions(proposalMutationOptions),
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
            {isTutor ? (
              <Field>
                <FieldLabel>Scheduling method</FieldLabel>
                <Select
                  value={mode}
                  onValueChange={(value) => {
                    const next = getSelectItemValue(value);
                    if (next === "availability" || next === "custom") {
                      setMode(next);
                      setNewDate("");
                      setNewTime("");
                      setSelectedSlotId("");
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a scheduling method" />
                  </SelectTrigger>
                  <SelectPopup>
                    <SelectList>
                      <SelectItem value="availability">
                        Use my availability
                      </SelectItem>
                      <SelectItem value="custom">
                        Choose a custom time
                      </SelectItem>
                    </SelectList>
                  </SelectPopup>
                </Select>
              </Field>
            ) : null}

            {usingAvailability ? (
              <Field>
                <FieldLabel>Tutor availability</FieldLabel>
                {availabilityQuery.isPending ? (
                  <div className="rounded-lg border border-item-border bg-item p-4 text-sm text-muted">
                    Loading tutor availability…
                  </div>
                ) : slots.length > 0 ? (
                  <div className="grid max-h-72 gap-2 overflow-y-auto p-0.5 sm:grid-cols-2">
                    {slots.map((slot) => {
                      const selected = slot.id === selectedSlotId;
                      return (
                        <Button
                          key={slot.id}
                          type="button"
                          variant={selected ? "primary" : "outline"}
                          aria-pressed={selected}
                          className="h-auto min-h-20 justify-start px-4 py-3 text-left"
                          onClick={() => {
                            const earliestStart = getEarliestStart(
                              slot.startDate,
                            );
                            setSelectedSlotId(slot.id);
                            setNewDate(formatDateValue(earliestStart));
                            setNewTime(formatTimeValue(earliestStart));
                          }}
                        >
                          <span className="flex min-w-0 flex-col items-start gap-1">
                            <span className="font-medium">
                              {formatSlotDate(slot.startDate)}
                            </span>
                            <span className="flex items-center gap-1.5 text-sm opacity-80">
                              <IconClock />
                              {formatTimeValue(slot.startDate)}–
                              {formatTimeValue(slot.endDate)} WIB
                            </span>
                          </span>
                          {selected ? <IconCheck className="ml-auto" /> : null}
                        </Button>
                      );
                    })}
                  </div>
                ) : (
                  <EmptyState
                    icon={<IconCalendarEvent />}
                    title={
                      availabilityQuery.isError
                        ? "Availability unavailable"
                        : "No matching availability"
                    }
                    description={
                      availabilityQuery.isError
                        ? "Tutor availability could not be loaded. Choose a custom time or try again."
                        : isTutor
                          ? "No matching windows. You can choose a custom time instead."
                          : "This tutor has no matching availability right now."
                    }
                    tone={availabilityQuery.isError ? "danger" : "secondary"}
                    size="inline"
                    className="rounded-lg border border-item-border"
                  />
                )}
                {slots.length > 0 ? (
                  <FieldDescription>
                    {availabilityQuery.isError
                      ? "Tutor availability could not be loaded."
                      : "Pick any minute within a window; the session lasts 90 minutes."}
                  </FieldDescription>
                ) : null}
              </Field>
            ) : (
              <Field>
                <FieldLabel htmlFor="reschedule-date">New date</FieldLabel>
                <DatePicker
                  id="reschedule-date"
                  value={newDate}
                  minDate={new Date().toISOString().slice(0, 10)}
                  placeholder="Pick the proposed date"
                  onChange={setNewDate}
                />
                <FieldDescription>
                  Custom times may be outside your published availability.
                </FieldDescription>
              </Field>
            )}
            <Field>
              <FieldLabel htmlFor="reschedule-time">New start time</FieldLabel>
              <MinuteTimeInput
                id="reschedule-time"
                value={newTime}
                onChange={setNewTime}
                minTime={usingAvailability ? minTime : undefined}
                maxTime={usingAvailability ? maxTime : undefined}
                disabled={usingAvailability && !selectedSlot}
              />
              <FieldDescription>
                Fixed 90 minutes · ends at {addMinutesToTime(newTime, 90)} WIB
                {usingAvailability && minTime && maxTime
                  ? ` · valid starts ${minTime}–${maxTime}`
                  : ""}
              </FieldDescription>
            </Field>
            {newDate && validTime ? (
              <div className="rounded-lg border border-item-border bg-item p-3 text-sm">
                <span className="text-muted">Current: </span>
                {formatSchedule(currentStartAt)}
                <span className="mx-2 text-dimmed">→</span>
                <span className="text-muted">Proposed: </span>
                {formatProposedSchedule(newDate, newTime)}
              </div>
            ) : null}
            <Field>
              <FieldLabel htmlFor="reschedule-reason">
                Reason (optional)
              </FieldLabel>
              <Textarea
                id="reschedule-reason"
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
                  availabilitySlotId:
                    usingAvailability && selectedSlotId
                      ? selectedSlotId
                      : undefined,
                  reason: reason.trim() || undefined,
                })
              }
              progress={propose.isPending}
              disabled={
                !newDate ||
                !validTime ||
                (usingAvailability && !selectedSlotId) ||
                propose.isPending
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

function formatDateValue(value: Date | string) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function getEarliestStart(slotStart: Date | string) {
  const start = new Date(slotStart);
  const now = new Date();
  now.setSeconds(0, 0);
  now.setMinutes(now.getMinutes() + 1);
  return start > now ? start : now;
}

function formatTimeValue(value: Date | string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

function formatSlotLabel(start: Date | string, end: Date | string) {
  return `${formatSlotDate(start)} · ${formatTimeValue(start)}–${formatTimeValue(end)} WIB`;
}

function formatSlotDate(value: Date | string) {
  return new Intl.DateTimeFormat("en-ID", {
    timeZone: "Asia/Jakarta",
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(value));
}

function formatSchedule(value?: Date | string | null) {
  return value
    ? formatSlotLabel(value, new Date(new Date(value).getTime() + 90 * 60_000))
    : "Not scheduled";
}

function formatProposedSchedule(date: string, time: string) {
  const start = new Date(`${date}T${time}:00+07:00`);
  return formatSlotLabel(start, new Date(start.getTime() + 90 * 60_000));
}
