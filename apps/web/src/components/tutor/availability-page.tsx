"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconCalendarEvent,
  IconClock,
  IconDeviceLaptop,
  IconMapPin,
  IconPencil,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@cogito-app/ui/components/selia/field";
import { Heading } from "@cogito-app/ui/components/selia/heading";
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
import { Stack } from "@cogito-app/ui/components/selia/stack";
import { Text } from "@cogito-app/ui/components/selia/text";
import { toastManager } from "@cogito-app/ui/components/selia/toast";

import {
  formatBookingDate,
  formatBookingTimeRange,
} from "@/components/booking/booking-ui";
import { orpc } from "@/utils/orpc";

const BOOKING_TIMEZONE = "Asia/Jakarta";
const MODALITY_LABELS = {
  online: "Online",
  offline: "Offline",
  both: "Online and offline",
} as const;

type Modality = keyof typeof MODALITY_LABELS;
type ScheduleMode = "weekly" | "custom";

type AvailabilityForm = {
  mode: ScheduleMode;
  startDate: string;
  endDate: string;
  repeatUntil: string;
  modality: Modality;
};

type AvailabilityErrors = Partial<
  Record<keyof AvailabilityForm | "form", string>
>;

type AvailabilitySlot = {
  id: string;
  startDate: string | Date;
  endDate: string | Date;
  modality: Modality;
  isRecurring: boolean;
  recurrenceRule: string | null;
};

function createEmptyForm(): AvailabilityForm {
  return {
    mode: "weekly",
    startDate: "",
    endDate: "",
    repeatUntil: toDateInputValue(Date.now() + 12 * 7 * 24 * 60 * 60 * 1000),
    modality: "online",
  };
}

function getDateTimePart(parts: Intl.DateTimeFormatPart[], type: string) {
  return parts.find((part) => part.type === type)?.value ?? "";
}

function toDateTimeLocalValue(value: string | Date | number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BOOKING_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));

  return `${getDateTimePart(parts, "year")}-${getDateTimePart(parts, "month")}-${getDateTimePart(parts, "day")}T${getDateTimePart(parts, "hour")}:${getDateTimePart(parts, "minute")}`;
}

function toDateInputValue(value: string | Date | number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BOOKING_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));

  return `${getDateTimePart(parts, "year")}-${getDateTimePart(parts, "month")}-${getDateTimePart(parts, "day")}`;
}

function parseDateTimeLocalValue(value: string) {
  return new Date(`${value}:00+07:00`);
}

function parseDateInputValue(value: string) {
  return new Date(`${value}T23:59:59+07:00`);
}

function getAvailabilityErrorMessage(error: unknown) {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: string }).message)
      : "Something went wrong while updating availability.";
  const normalized = message.toLowerCase();

  if (normalized.includes("overlap")) {
    return "This time overlaps an existing availability slot. Choose a different time.";
  }
  if (normalized.includes("input validation")) {
    return "Check the start time, end time, and session format, then try again.";
  }

  return message;
}

export function AvailabilityPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<AvailabilityForm>(createEmptyForm);
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [errors, setErrors] = useState<AvailabilityErrors>({});

  const availabilityQuery = useQuery(
    orpc.tutor.listAvailability.queryOptions(),
  );

  const saveMutation = useMutation(
    orpc.tutor.upsertAvailability.mutationOptions({
      onSuccess: () => {
        toastManager.add({
          title: editingSlotId ? "Availability updated" : "Availability added",
          description:
            "Students can now request a session in this time window.",
          type: "success",
        });
        resetForm();
        void queryClient.invalidateQueries({
          queryKey: orpc.tutor.listAvailability.key(),
        });
      },
      onError: (error: unknown) => {
        const message = getAvailabilityErrorMessage(error);
        setErrors({ form: message });
        toastManager.add({
          title: "Availability could not be saved",
          description: message,
          type: "error",
        });
      },
    }),
  );

  const weeklyMutation = useMutation(
    orpc.tutor.createWeeklyAvailability.mutationOptions({
      onSuccess: (createdSlots) => {
        toastManager.add({
          title: "Weekly schedule added",
          description: `${createdSlots.length} weekly ${createdSlots.length === 1 ? "slot is" : "slots are"} now available to students.`,
          type: "success",
        });
        resetForm();
        void queryClient.invalidateQueries({
          queryKey: orpc.tutor.listAvailability.key(),
        });
      },
      onError: (error: unknown) => {
        const message = getAvailabilityErrorMessage(error);
        setErrors({ form: message });
        toastManager.add({
          title: "Weekly schedule could not be added",
          description: message,
          type: "error",
        });
      },
    }),
  );

  const deleteMutation = useMutation(
    orpc.tutor.deleteAvailability.mutationOptions({
      onSuccess: (_data, variables) => {
        toastManager.add({ title: "Availability removed", type: "success" });
        if (editingSlotId === variables.id) resetForm();
        void queryClient.invalidateQueries({
          queryKey: orpc.tutor.listAvailability.key(),
        });
      },
      onError: (error: unknown) => {
        toastManager.add({
          title: "Availability could not be removed",
          description: getAvailabilityErrorMessage(error),
          type: "error",
        });
      },
    }),
  );

  const slots = ((availabilityQuery.data ?? []) as AvailabilitySlot[]).toSorted(
    (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
  );
  const minDateTime = toDateTimeLocalValue(Date.now() + 60_000);
  const isSaving = saveMutation.isPending || weeklyMutation.isPending;

  function resetForm() {
    setForm(createEmptyForm());
    setEditingSlotId(null);
    setErrors({});
  }

  function updateForm<K extends keyof AvailabilityForm>(
    field: K,
    value: AvailabilityForm[K],
  ) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[field];
      delete next.form;
      return next;
    });
  }

  function setScheduleMode(mode: ScheduleMode) {
    setEditingSlotId(null);
    setForm((current) => ({
      ...current,
      mode,
      repeatUntil:
        mode === "weekly"
          ? current.repeatUntil ||
            toDateInputValue(Date.now() + 12 * 7 * 24 * 60 * 60 * 1000)
          : "",
    }));
    setErrors({});
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors: AvailabilityErrors = {};
    if (!form.startDate) nextErrors.startDate = "Choose a start time.";
    if (!form.endDate) nextErrors.endDate = "Choose an end time.";

    const start = form.startDate
      ? parseDateTimeLocalValue(form.startDate)
      : null;
    const end = form.endDate ? parseDateTimeLocalValue(form.endDate) : null;
    const repeatUntil =
      form.mode === "weekly" && form.repeatUntil
        ? parseDateInputValue(form.repeatUntil)
        : null;

    if (start && Number.isNaN(start.getTime())) {
      nextErrors.startDate = "Choose a valid start time.";
    } else if (start && start <= new Date()) {
      nextErrors.startDate = "The start time must be in the future.";
    }
    if (end && Number.isNaN(end.getTime())) {
      nextErrors.endDate = "Choose a valid end time.";
    } else if (end && end <= new Date()) {
      nextErrors.endDate = "The end time must be in the future.";
    }
    if (start && end && end <= start) {
      nextErrors.endDate = "The end time must be after the start time.";
    }
    if (form.mode === "weekly") {
      if (!form.repeatUntil) {
        nextErrors.repeatUntil = "Choose when the weekly schedule ends.";
      } else if (!repeatUntil || Number.isNaN(repeatUntil.getTime())) {
        nextErrors.repeatUntil = "Choose a valid end date.";
      } else if (start && repeatUntil < start) {
        nextErrors.repeatUntil =
          "The schedule end date must be on or after the first session.";
      }
    }

    if (
      Object.keys(nextErrors).length > 0 ||
      !start ||
      !end ||
      (form.mode === "weekly" && !repeatUntil)
    ) {
      setErrors(nextErrors);
      return;
    }

    if (form.mode === "weekly") {
      weeklyMutation.mutate({
        startDate: start,
        endDate: end,
        repeatUntil: repeatUntil!,
        modality: form.modality,
      });
    } else {
      saveMutation.mutate({
        id: editingSlotId ?? undefined,
        startDate: start,
        endDate: end,
        modality: form.modality,
        isRecurring: false,
        isActive: true,
      });
    }
  }

  function editSlot(slot: AvailabilitySlot) {
    setEditingSlotId(slot.id);
    setForm({
      mode: "custom",
      startDate: toDateTimeLocalValue(slot.startDate),
      endDate: toDateTimeLocalValue(slot.endDate),
      repeatUntil: "",
      modality: slot.modality,
    });
    setErrors({});
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function removeSlot(slot: AvailabilitySlot) {
    if (
      !window.confirm(
        `Remove the ${formatBookingDate(slot.startDate, BOOKING_TIMEZONE)} availability slot?`,
      )
    ) {
      return;
    }
    deleteMutation.mutate({ id: slot.id });
  }

  if (availabilityQuery.isPending) return <AvailabilitySkeleton />;

  if (availabilityQuery.isError) {
    return (
      <Card>
        <CardBody className="flex min-h-72 flex-col items-center justify-center text-center">
          <IconBox variant="danger-subtle" size="lg" className="mb-4">
            <IconCalendarEvent />
          </IconBox>
          <Heading size="sm">Availability could not be loaded</Heading>
          <Text className="mt-2 max-w-md text-muted">
            {getAvailabilityErrorMessage(availabilityQuery.error)}
          </Text>
          <Button
            variant="secondary"
            className="mt-5"
            onClick={() => void availabilityQuery.refetch()}
          >
            Try again
          </Button>
        </CardBody>
      </Card>
    );
  }

  return (
    <Stack direction="column" spacing="lg">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge variant="info" pill>
            Tutor workspace
          </Badge>
          <Heading size="md" className="mt-3">
            Availability
          </Heading>
          <Text className="mt-2 max-w-2xl text-muted">
            Add future time windows that students can choose when requesting a
            session. All times use Western Indonesia Time (WIB).
          </Text>
        </div>
        {availabilityQuery.isFetching ? (
          <Badge variant="secondary" pill>
            Updating...
          </Badge>
        ) : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(18rem,0.75fr)_minmax(0,1.25fr)] xl:items-start">
        <Card>
          <CardHeader>
            <IconBox variant="info-subtle">
              {editingSlotId ? <IconPencil /> : <IconPlus />}
            </IconBox>
            <CardTitle>
              {editingSlotId ? "Edit availability" : "Add availability"}
            </CardTitle>
            <CardDescription>
              {editingSlotId
                ? "Edit this availability occurrence as a custom slot."
                : "Set a weekly schedule or add a one-time custom slot."}
            </CardDescription>
          </CardHeader>
          <CardBody>
            <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
              {!editingSlotId ? (
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={form.mode === "weekly" ? "primary" : "outline"}
                    onClick={() => setScheduleMode("weekly")}
                  >
                    Weekly schedule
                  </Button>
                  <Button
                    type="button"
                    variant={form.mode === "custom" ? "primary" : "outline"}
                    onClick={() => setScheduleMode("custom")}
                  >
                    One-time slot
                  </Button>
                </div>
              ) : null}

              <Field>
                <FieldLabel htmlFor="availability-start">Start time</FieldLabel>
                <Input
                  id="availability-start"
                  type="datetime-local"
                  min={minDateTime}
                  value={form.startDate}
                  onChange={(event) =>
                    updateForm("startDate", event.target.value)
                  }
                />
                {errors.startDate ? (
                  <FieldError>{errors.startDate}</FieldError>
                ) : null}
              </Field>

              <Field>
                <FieldLabel htmlFor="availability-end">End time</FieldLabel>
                <Input
                  id="availability-end"
                  type="datetime-local"
                  min={form.startDate || minDateTime}
                  value={form.endDate}
                  onChange={(event) =>
                    updateForm("endDate", event.target.value)
                  }
                />
                {errors.endDate ? (
                  <FieldError>{errors.endDate}</FieldError>
                ) : null}
              </Field>

              {form.mode === "weekly" ? (
                <Field>
                  <FieldLabel htmlFor="availability-repeat-until">
                    Repeat until
                  </FieldLabel>
                  <Input
                    id="availability-repeat-until"
                    type="date"
                    min={form.startDate.slice(0, 10)}
                    value={form.repeatUntil}
                    onChange={(event) =>
                      updateForm("repeatUntil", event.target.value)
                    }
                  />
                  <FieldDescription>
                    The first session&apos;s weekday and time repeat every week.
                    The default horizon is 12 weeks, with up to 52 weeks
                    supported.
                  </FieldDescription>
                  {errors.repeatUntil ? (
                    <FieldError>{errors.repeatUntil}</FieldError>
                  ) : null}
                </Field>
              ) : null}

              <Field>
                <FieldLabel>Session format</FieldLabel>
                <Select
                  value={form.modality}
                  onValueChange={(value) => {
                    const modality = getSelectItemValue(value);
                    if (
                      modality !== "online" &&
                      modality !== "offline" &&
                      modality !== "both"
                    ) {
                      return;
                    }
                    updateForm("modality", modality);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a format" />
                  </SelectTrigger>
                  <SelectPopup>
                    <SelectList>
                      <SelectItem value="online">Online</SelectItem>
                      <SelectItem value="offline">Offline</SelectItem>
                      <SelectItem value="both">Online and offline</SelectItem>
                    </SelectList>
                  </SelectPopup>
                </Select>
                <FieldDescription>
                  Students will only see formats supported by your tutor
                  profile.
                </FieldDescription>
              </Field>

              {errors.form ? (
                <Text className="text-danger">{errors.form}</Text>
              ) : null}

              <div className="flex flex-wrap justify-end gap-2">
                {editingSlotId ? (
                  <Button
                    type="button"
                    variant="plain"
                    onClick={resetForm}
                    disabled={isSaving}
                  >
                    Cancel
                  </Button>
                ) : null}
                <Button type="submit" progress={isSaving} disabled={isSaving}>
                  {editingSlotId
                    ? "Save changes"
                    : form.mode === "weekly"
                      ? "Add weekly schedule"
                      : "Add custom slot"}
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <IconBox variant="success-subtle">
              <IconCalendarEvent />
            </IconBox>
            <CardTitle>Upcoming availability</CardTitle>
            <CardDescription>
              {slots.length === 0
                ? "No future slots yet. Add a weekly schedule or custom slot to start receiving requests."
                : `${slots.length} future ${slots.length === 1 ? "slot" : "slots"} available to students.`}
            </CardDescription>
          </CardHeader>
          <CardBody>
            {slots.length === 0 ? (
              <div className="rounded-lg border border-item-border bg-item p-8 text-center">
                <IconBox
                  variant="secondary-subtle"
                  size="lg"
                  className="mx-auto mb-4"
                >
                  <IconClock />
                </IconBox>
                <Heading size="sm">Your calendar is open</Heading>
                <Text className="mt-2 text-muted">
                  Add a time window and students will be able to choose it when
                  booking a solo session.
                </Text>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {slots.map((slot) => (
                  <AvailabilitySlotCard
                    key={slot.id}
                    slot={slot}
                    isEditing={editingSlotId === slot.id}
                    isDeleting={
                      deleteMutation.isPending &&
                      deleteMutation.variables?.id === slot.id
                    }
                    onEdit={() => editSlot(slot)}
                    onRemove={() => removeSlot(slot)}
                  />
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </Stack>
  );
}

function AvailabilitySlotCard({
  slot,
  isEditing,
  isDeleting,
  onEdit,
  onRemove,
}: {
  slot: AvailabilitySlot;
  isEditing: boolean;
  isDeleting: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const ModalityIcon =
    slot.modality === "offline" ? IconMapPin : IconDeviceLaptop;

  return (
    <div
      className={`rounded-lg border p-4 transition-colors ${
        isEditing
          ? "border-primary-border bg-primary/5"
          : "border-item-border bg-item"
      }`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <IconBox variant="secondary-subtle" size="sm">
            <ModalityIcon />
          </IconBox>
          <div className="min-w-0">
            <Text className="font-medium">
              {formatBookingDate(slot.startDate, BOOKING_TIMEZONE)}
            </Text>
            <Text className="mt-1 text-sm text-muted">
              {formatBookingTimeRange(
                slot.startDate,
                slot.endDate,
                BOOKING_TIMEZONE,
              )}{" "}
              WIB
            </Text>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <Badge variant="secondary" pill>
            {MODALITY_LABELS[slot.modality]}
          </Badge>
          <Badge variant={slot.isRecurring ? "info" : "secondary"} pill>
            {slot.isRecurring ? "Weekly" : "One-time"}
          </Badge>
          <Button
            variant="plain"
            size="sm"
            onClick={onEdit}
            disabled={isDeleting}
          >
            <IconPencil /> {slot.isRecurring ? "Edit occurrence" : "Edit"}
          </Button>
          <Button
            variant="plain"
            size="sm"
            className="text-danger"
            onClick={onRemove}
            progress={isDeleting}
            disabled={isDeleting}
          >
            <IconTrash /> {slot.isRecurring ? "Remove occurrence" : "Remove"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function AvailabilitySkeleton() {
  return (
    <div className="grid animate-pulse gap-4 xl:grid-cols-[minmax(18rem,0.75fr)_minmax(0,1.25fr)]">
      <Card className="min-h-96 bg-accent/40" />
      <Card className="min-h-96 bg-accent/40" />
    </div>
  );
}
