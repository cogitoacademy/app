"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconCalendarEvent,
  IconChevronLeft,
  IconChevronRight,
  IconClock,
  IconCopy,
  IconDeviceLaptop,
  IconMapPin,
  IconPlus,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  CardInfoPreview,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import { Checkbox } from "@cogito-app/ui/components/selia/checkbox";
import { Chip, ChipButton } from "@cogito-app/ui/components/selia/chip";
import { DatePicker } from "@cogito-app/ui/components/selia/date-picker";
import {
  Field,
  FieldError,
  FieldLabel,
} from "@cogito-app/ui/components/selia/field";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { IconBox } from "@cogito-app/ui/components/selia/icon-box";
import {
  Item,
  ItemAction,
  ItemContent,
  ItemMedia,
  ItemTitle,
} from "@cogito-app/ui/components/selia/item";
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
import { Tabs, TabsItem, TabsList } from "@cogito-app/ui/components/selia/tabs";
import { Text } from "@cogito-app/ui/components/selia/text";
import { toastManager } from "@cogito-app/ui/components/selia/toast";

import { formatBookingTimeRange } from "@/components/booking/booking-ui";
import { MinuteTimeInput } from "@/components/booking/minute-time-input";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { InfoPreview } from "@/components/info-preview";
import Loader from "@/components/loader";
import { getDateOverrideValidationError } from "@/components/tutor/availability-override-validation";
import { useNow } from "@/hooks/use-now";
import { getUserFacingError } from "@/lib/error-message";
import { orpc } from "@/utils/orpc";

const TIMEZONE = "Asia/Jakarta";
const DAY_MS = 86_400_000;
const DAYS = [
  [1, "Monday", "Mon"],
  [2, "Tuesday", "Tue"],
  [3, "Wednesday", "Wed"],
  [4, "Thursday", "Thu"],
  [5, "Friday", "Fri"],
  [6, "Saturday", "Sat"],
  [0, "Sunday", "Sun"],
] as const;

type Modality = "online" | "offline" | "both";
type TimeRange = { id: string; start: string; end: string; modality: Modality };
type OverrideRange = Omit<TimeRange, "modality">;
type WeeklyDay = { enabled: boolean; ranges: TimeRange[] };
type WeeklySchedule = Record<number, WeeklyDay>;
type AvailabilitySlot = {
  id: string;
  startDate: string | Date;
  endDate: string | Date;
  isRecurring: boolean;
  modality?: Modality;
};

const MODALITY_OPTIONS: ReadonlyArray<{
  value: Modality;
  label: string;
  icon?: ReactNode;
}> = [
  {
    value: "online",
    label: "Online",
    icon: <IconDeviceLaptop aria-hidden="true" />,
  },
  {
    value: "offline",
    label: "Offline",
    icon: <IconMapPin aria-hidden="true" />,
  },
  { value: "both", label: "Both" },
];

const newRange = (): TimeRange => ({
  id: crypto.randomUUID(),
  start: "09:00",
  end: "17:00",
  modality: "online",
});

const newOverrideRange = (): OverrideRange => ({
  id: crypto.randomUUID(),
  start: "09:00",
  end: "17:00",
});

function initialSchedule(): WeeklySchedule {
  return Object.fromEntries(
    DAYS.map(([day]) => [
      day,
      { enabled: day >= 1 && day <= 5, ranges: [newRange()] },
    ]),
  );
}

function dateKey(value: Date | number = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function weekStart(value: string) {
  const date = new Date(`${value}T00:00:00Z`);
  return addDays(value, -((date.getUTCDay() + 6) % 7));
}

function formatOverrideDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00+07:00`));
}

function formatPreviewDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00+07:00`));
}

function formatPreviewDay(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    day: "numeric",
    month: "short",
  }).format(new Date(`${value}T00:00:00+07:00`));
}

function errorMessage(error: unknown) {
  return getUserFacingError(error, "Availability could not be updated.");
}

function timeValue(value: string | Date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function scheduleFromSlots(slots: readonly AvailabilitySlot[]) {
  const recurring = slots.filter((slot) => slot.isRecurring);
  if (recurring.length === 0) return null;

  const next = initialSchedule();
  for (const day of DAYS) next[day[0]] = { enabled: false, ranges: [] };
  for (const slot of recurring) {
    const day = new Date(
      `${dateKey(new Date(slot.startDate))}T00:00:00Z`,
    ).getUTCDay();
    const candidate = {
      id: crypto.randomUUID(),
      start: timeValue(slot.startDate),
      end: timeValue(slot.endDate),
      modality: slot.modality ?? "online",
    } satisfies TimeRange;
    const current = next[day]!;
    if (
      !current.ranges.some(
        (range) =>
          range.start === candidate.start &&
          range.end === candidate.end &&
          range.modality === candidate.modality,
      )
    ) {
      current.ranges.push(candidate);
    }
    current.enabled = true;
  }
  for (const day of DAYS) {
    if (next[day[0]]!.ranges.length === 0) {
      next[day[0]]!.ranges = [newRange()];
    }
  }

  return next;
}

export function AvailabilityPage() {
  const availability = useQuery(orpc.tutor.listAvailability.queryOptions());
  if (availability.isPending) return <Loader />;

  const slots = ((availability.data ?? []) as AvailabilitySlot[]).toSorted(
    (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
  );
  const hasRecurringSlots = slots.some((slot) => slot.isRecurring);

  return (
    <AvailabilityPageContent
      key={hasRecurringSlots ? "recurring" : "empty"}
      slots={slots}
    />
  );
}

function AvailabilityPageContent({ slots }: { slots: AvailabilitySlot[] }) {
  const queryClient = useQueryClient();
  const [schedule, setSchedule] = useState<WeeklySchedule>(
    () => scheduleFromSlots(slots) ?? initialSchedule(),
  );
  const [repeatUntil, setRepeatUntil] = useState(() =>
    dateKey(Date.now() + 12 * 7 * DAY_MS),
  );
  const [overrideDates, setOverrideDates] = useState<string[]>(() => [
    dateKey(Date.now() + DAY_MS),
  ]);
  const [overrideDateCandidate, setOverrideDateCandidate] = useState("");
  const [overrideModality, setOverrideModality] = useState<Modality>("online");
  const [overrideRanges, setOverrideRanges] = useState<OverrideRange[]>(() => [
    newOverrideRange(),
  ]);
  const [previewStart, setPreviewStart] = useState(() => weekStart(dateKey()));
  const [selectedPreviewDate, setSelectedPreviewDate] = useState("");
  const [slotPendingRemoval, setSlotPendingRemoval] =
    useState<AvailabilitySlot | null>(null);
  const now = useNow();
  const minimumDate = useMemo(() => dateKey(now + DAY_MS), [now]);
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: orpc.tutor.listAvailability.key(),
    });

  const replaceWeekly = useMutation(
    orpc.tutor.replaceWeeklyAvailability.mutationOptions({
      onSuccess: (generatedSlots) => {
        toastManager.add({
          title: "Weekly hours saved",
          description: `${generatedSlots.length} availability windows generated.`,
          type: "success",
        });
        void refresh();
      },
      onError: (error: unknown) =>
        toastManager.add({
          title: "Weekly hours could not be saved",
          description: errorMessage(error),
          type: "error",
        }),
    }),
  );
  const createDateOverrides = useMutation(
    orpc.tutor.createDateOverrides.mutationOptions({
      onSuccess: (createdSlots) => {
        toastManager.add({
          title: "Date overrides saved",
          description: `${createdSlots.length} availability windows created.`,
          type: "success",
        });
        setOverrideDates([]);
        setOverrideRanges([newOverrideRange()]);
        void refresh();
      },
      onError: (error: unknown) =>
        toastManager.add({
          title: "Date overrides could not be saved",
          description: errorMessage(error),
          type: "error",
        }),
    }),
  );
  const removeSlot = useMutation(
    orpc.tutor.deleteAvailability.mutationOptions({
      onSuccess: () => {
        toastManager.add({
          title: "Availability removed",
          type: "success",
        });
        setSlotPendingRemoval(null);
        void refresh();
      },
      onError: (error: unknown) =>
        toastManager.add({
          title: "Availability could not be removed",
          description: errorMessage(error),
          type: "error",
        }),
    }),
  );

  const previewDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(previewStart, index)),
    [previewStart],
  );
  const slotsByDay = useMemo(() => {
    const result = new Map<string, AvailabilitySlot[]>();
    for (const slot of slots) {
      const key = dateKey(new Date(slot.startDate));
      result.set(key, [...(result.get(key) ?? []), slot]);
    }
    return result;
  }, [slots]);
  const overrideSlotCount = overrideDates.length * overrideRanges.length;
  const overrideValidationError = useMemo(
    () =>
      getDateOverrideValidationError({
        dates: overrideDates,
        ranges: overrideRanges,
        minimumDate,
        existingSlots: slots,
      }),
    [minimumDate, overrideDates, overrideRanges, slots],
  );
  const activePreviewDate =
    selectedPreviewDate && previewDays.includes(selectedPreviewDate)
      ? selectedPreviewDate
      : (previewDays.find((date) => (slotsByDay.get(date) ?? []).length > 0) ??
        previewDays[0]!);

  function updateDay(day: number, fn: (value: WeeklyDay) => WeeklyDay) {
    setSchedule((current) => ({ ...current, [day]: fn(current[day]!) }));
  }

  function saveWeekly(event: FormEvent) {
    event.preventDefault();
    const ranges = DAYS.flatMap(([day]) => {
      const value = schedule[day]!;
      return value.enabled
        ? value.ranges.map((range) => ({
            dayOfWeek: day,
            startTime: range.start,
            endTime: range.end,
            modality: range.modality,
          }))
        : [];
    });
    if (ranges.some((range) => range.endTime <= range.startTime)) {
      toastManager.add({
        title: "Check weekly hours",
        description: "Every end time must be after its start time.",
        type: "error",
      });
      return;
    }
    replaceWeekly.mutate({
      effectiveFrom: new Date(`${dateKey(Date.now() + DAY_MS)}T00:00:00+07:00`),
      repeatUntil: new Date(`${repeatUntil}T23:59:59+07:00`),
      ranges,
    });
  }

  function saveOverride(event: FormEvent) {
    event.preventDefault();
    if (overrideValidationError) {
      toastManager.add({
        title: "Check date overrides",
        description: overrideValidationError,
        type: "error",
      });
      return;
    }

    createDateOverrides.mutate({
      slots: overrideDates.flatMap((date) =>
        overrideRanges.map((range) => ({
          startDate: new Date(`${date}T${range.start}:00+07:00`),
          endDate: new Date(`${date}T${range.end}:00+07:00`),
          modality: overrideModality,
        })),
      ),
    });
  }

  return (
    <Stack direction="column" spacing="lg">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Heading level={1} size="md">
            Open your calendar to students
          </Heading>
          <Text className="text-muted">
            Set your regular teaching hours, then adjust individual dates when
            plans change.
          </Text>
        </div>
        <Badge variant="secondary" pill>
          Asia/Jakarta · 90-minute sessions
        </Badge>
      </div>

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,30fr)_minmax(0,25fr)] xl:items-start">
        <form onSubmit={saveWeekly}>
          <Card>
            <CardHeader>
              <IconBox variant="primary-subtle" size="md">
                <IconClock />
              </IconBox>
              <CardTitle>
                Weekly hours
                <CardInfoPreview>
                  <InfoPreview
                    title="Weekly hours"
                    description="Choose when students can normally book you."
                  />
                </CardInfoPreview>
              </CardTitle>
            </CardHeader>
            <CardBody className="divide-y divide-item-border py-0">
              {DAYS.map(([day, label]) => {
                const value = schedule[day]!;
                return (
                  <div
                    key={day}
                    className="grid gap-3 py-4 sm:grid-cols-[7rem_1fr]"
                  >
                    <label className="flex items-center gap-3 self-start pt-2">
                      <Checkbox
                        checked={value.enabled}
                        onCheckedChange={(checked) =>
                          updateDay(day, (current) => ({
                            ...current,
                            enabled: checked === true,
                          }))
                        }
                      />
                      <Text className="font-medium">{label}</Text>
                    </label>
                    {value.enabled ? (
                      <div className="space-y-2">
                        {value.ranges.map((range) => (
                          <div
                            key={range.id}
                            className="grid gap-2 sm:grid-cols-[6rem_1rem_6rem_9rem_auto]"
                          >
                            <MinuteTimeInput
                              id={`availability-${day}-${range.id}-start`}
                              ariaLabel={`${label} start`}
                              value={range.start}
                              onChange={(nextTime) =>
                                updateDay(day, (current) => ({
                                  ...current,
                                  ranges: current.ranges.map((item) =>
                                    item.id === range.id
                                      ? { ...item, start: nextTime }
                                      : item,
                                  ),
                                }))
                              }
                            />
                            <span
                              aria-hidden="true"
                              className="flex items-center justify-center text-muted"
                            >
                              -
                            </span>
                            <MinuteTimeInput
                              id={`availability-${day}-${range.id}-end`}
                              ariaLabel={`${label} end`}
                              value={range.end}
                              onChange={(nextTime) =>
                                updateDay(day, (current) => ({
                                  ...current,
                                  ranges: current.ranges.map((item) =>
                                    item.id === range.id
                                      ? { ...item, end: nextTime }
                                      : item,
                                  ),
                                }))
                              }
                            />
                            <ModalitySelect
                              value={range.modality}
                              onChange={(modality) =>
                                updateDay(day, (current) => ({
                                  ...current,
                                  ranges: current.ranges.map((item) =>
                                    item.id === range.id
                                      ? { ...item, modality }
                                      : item,
                                  ),
                                }))
                              }
                            />
                            <Button
                              type="button"
                              variant="danger"
                              size="sm-icon"
                              aria-label={`Remove ${label} hours`}
                              disabled={value.ranges.length === 1}
                              onClick={() =>
                                updateDay(day, (current) => ({
                                  ...current,
                                  ranges: current.ranges.filter(
                                    (item) => item.id !== range.id,
                                  ),
                                }))
                              }
                            >
                              <IconTrash />
                            </Button>
                          </div>
                        ))}
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="plain"
                            size="xs"
                            disabled={value.ranges.length >= 3}
                            onClick={() =>
                              updateDay(day, (current) => ({
                                ...current,
                                ranges: [...current.ranges, newRange()],
                              }))
                            }
                          >
                            <IconPlus /> Add hours
                          </Button>
                          <Button
                            type="button"
                            variant="plain"
                            size="xs"
                            onClick={() => {
                              const source = value.ranges;
                              setSchedule((current) =>
                                Object.fromEntries(
                                  DAYS.map(([target]) => [
                                    target,
                                    target >= 1 && target <= 5
                                      ? {
                                          enabled: true,
                                          ranges: source.map((range) => ({
                                            id: crypto.randomUUID(),
                                            start: range.start,
                                            end: range.end,
                                            modality: range.modality,
                                          })),
                                        }
                                      : current[target]!,
                                  ]),
                                ),
                              );
                            }}
                          >
                            <IconCopy /> Apply to weekdays
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Text className="py-2 text-muted">Unavailable</Text>
                    )}
                  </div>
                );
              })}
            </CardBody>
            <CardFooter className="flex-col items-stretch gap-3 sm:flex-row sm:items-end">
              <Field className="sm:max-w-56">
                <FieldLabel htmlFor="schedule-until">Generate until</FieldLabel>
                <DatePicker
                  id="schedule-until"
                  minDate={minimumDate}
                  value={repeatUntil}
                  onChange={setRepeatUntil}
                />
              </Field>
              <Button type="submit" progress={replaceWeekly.isPending}>
                Save weekly hours
              </Button>
            </CardFooter>
          </Card>
        </form>

        <div className="space-y-4 xl:sticky xl:top-0">
          <Card>
            <CardHeader>
              <IconBox variant="danger-subtle">
                <IconCalendarEvent />
              </IconBox>
              <CardTitle>
                Date overrides
                <CardInfoPreview>
                  <InfoPreview
                    title="Date overrides"
                    description="Apply the same one-time hours to up to 14 selected dates. These hours replace conflicting weekly availability."
                  />
                </CardInfoPreview>
              </CardTitle>
            </CardHeader>
            <CardBody>
              <form onSubmit={saveOverride} className="space-y-4">
                <Tabs
                  value={overrideModality}
                  onValueChange={(value) => {
                    if (
                      value === "online" ||
                      value === "offline" ||
                      value === "both"
                    ) {
                      setOverrideModality(value);
                    }
                  }}
                >
                  <TabsList aria-label="Override format">
                    {MODALITY_OPTIONS.map((option) => (
                      <TabsItem key={option.value} value={option.value}>
                        {option.icon}
                        {option.label}
                      </TabsItem>
                    ))}
                  </TabsList>
                </Tabs>
                <Field>
                  <FieldLabel htmlFor="override-date">Dates</FieldLabel>
                  <DatePicker
                    id="override-date"
                    minDate={minimumDate}
                    value={overrideDateCandidate}
                    placeholder={
                      overrideDates.length === 0
                        ? "Add a date"
                        : "Add another date"
                    }
                    disabled={overrideDates.length >= 14}
                    onChange={(date) => {
                      setOverrideDateCandidate("");
                      if (!date) return;
                      setOverrideDates((current) =>
                        current.includes(date)
                          ? current
                          : [...current, date].toSorted(),
                      );
                    }}
                  />
                  {overrideDates.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {overrideDates.map((date) => (
                        <Chip key={date} pill>
                          {formatOverrideDate(date)}
                          <ChipButton
                            type="button"
                            aria-label={`Remove ${formatOverrideDate(date)}`}
                            onClick={() =>
                              setOverrideDates((current) =>
                                current.filter((item) => item !== date),
                              )
                            }
                          >
                            <IconX aria-hidden="true" />
                          </ChipButton>
                        </Chip>
                      ))}
                    </div>
                  ) : (
                    <Text className="text-xs text-muted">
                      Choose at least one date.
                    </Text>
                  )}
                </Field>
                <Field>
                  <FieldLabel>Available hours</FieldLabel>
                  <div className="space-y-2">
                    {overrideRanges.map((range, index) => (
                      <div
                        key={range.id}
                        className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-center gap-2"
                      >
                        <MinuteTimeInput
                          id={`override-${range.id}-start`}
                          ariaLabel={`Override time ${index + 1} start`}
                          value={range.start}
                          onChange={(start) =>
                            setOverrideRanges((current) =>
                              current.map((item) =>
                                item.id === range.id
                                  ? { ...item, start }
                                  : item,
                              ),
                            )
                          }
                        />
                        <Text aria-hidden="true" className="text-muted">
                          –
                        </Text>
                        <MinuteTimeInput
                          id={`override-${range.id}-end`}
                          ariaLabel={`Override time ${index + 1} end`}
                          value={range.end}
                          onChange={(end) =>
                            setOverrideRanges((current) =>
                              current.map((item) =>
                                item.id === range.id ? { ...item, end } : item,
                              ),
                            )
                          }
                        />
                        <Button
                          type="button"
                          variant="danger"
                          size="sm-icon"
                          aria-label={`Remove override time ${index + 1}`}
                          disabled={overrideRanges.length === 1}
                          onClick={() =>
                            setOverrideRanges((current) =>
                              current.filter((item) => item.id !== range.id),
                            )
                          }
                        >
                          <IconTrash aria-hidden="true" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="plain"
                      size="xs"
                      disabled={overrideRanges.length >= 4}
                      onClick={() =>
                        setOverrideRanges((current) => [
                          ...current,
                          newOverrideRange(),
                        ])
                      }
                    >
                      <IconPlus aria-hidden="true" /> Add hours
                    </Button>
                  </div>
                  {overrideValidationError ? (
                    <FieldError role="alert">
                      {overrideValidationError}
                    </FieldError>
                  ) : null}
                </Field>
                <Button
                  type="submit"
                  block
                  disabled={overrideValidationError !== null}
                  progress={createDateOverrides.isPending}
                >
                  Save {overrideSlotCount} override
                  {overrideSlotCount === 1 ? "" : "s"}
                </Button>
              </form>
            </CardBody>
          </Card>
          <CalendarPreview
            previewDays={previewDays}
            slotsByDay={slotsByDay}
            activeDate={activePreviewDate}
            onSelectDate={setSelectedPreviewDate}
            onPreviousWeek={() =>
              setPreviewStart((current) => addDays(current, -7))
            }
            onNextWeek={() => setPreviewStart((current) => addDays(current, 7))}
            onRequestRemove={setSlotPendingRemoval}
          />
        </div>
      </div>
      <ConfirmationDialog
        open={slotPendingRemoval !== null}
        onOpenChange={(open) => {
          if (!open) setSlotPendingRemoval(null);
        }}
        title="Remove this availability?"
        description={
          slotPendingRemoval
            ? `${formatBookingTimeRange(slotPendingRemoval.startDate, slotPendingRemoval.endDate, TIMEZONE)} will no longer be visible to students.`
            : "This availability will no longer be visible to students."
        }
        confirmLabel="Remove availability"
        confirmVariant="danger"
        pending={removeSlot.isPending}
        onConfirm={() => {
          if (slotPendingRemoval)
            removeSlot.mutate({ id: slotPendingRemoval.id });
        }}
      />
    </Stack>
  );
}

function CalendarPreview({
  previewDays,
  slotsByDay,
  activeDate,
  onSelectDate,
  onPreviousWeek,
  onNextWeek,
  onRequestRemove,
}: {
  previewDays: string[];
  slotsByDay: Map<string, AvailabilitySlot[]>;
  activeDate: string;
  onSelectDate: (date: string) => void;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
  onRequestRemove: (slot: AvailabilitySlot) => void;
}) {
  const activeSlots = slotsByDay.get(activeDate) ?? [];

  return (
    <Card>
      <CardHeader>
        <IconBox variant="success-subtle">
          <IconCalendarEvent />
        </IconBox>
        <CardTitle>
          Calendar preview
          <CardInfoPreview>
            <InfoPreview
              title="Calendar preview"
              description="Windows currently visible to students in Western Indonesia Time."
              tone="success"
            />
          </CardInfoPreview>
        </CardTitle>
      </CardHeader>
      <CardBody>
        <div className="space-y-4">
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="plain"
              size="sm-icon"
              aria-label="Previous week"
              onClick={onPreviousWeek}
            >
              <IconChevronLeft />
            </Button>
            <div className="grid min-w-0 flex-1 grid-cols-7 gap-1">
              {previewDays.map((date, index) => {
                const active = date === activeDate;
                return (
                  <Button
                    key={date}
                    type="button"
                    variant={active ? "tertiary" : "plain"}
                    aria-label={`${DAYS[index]![1]}, ${date}`}
                    aria-pressed={active}
                    className="min-w-0 flex-col gap-0 px-0 py-6"
                    onClick={() => onSelectDate(date)}
                  >
                    <span className="text-xs opacity-70">
                      {DAYS[index]![2]}
                    </span>
                    <span className="text-xs font-medium">
                      {formatPreviewDay(date)}
                    </span>
                  </Button>
                );
              })}
            </div>
            <Button
              type="button"
              variant="plain"
              size="sm-icon"
              aria-label="Next week"
              onClick={onNextWeek}
            >
              <IconChevronRight />
            </Button>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <Text className="font-medium">
                {formatPreviewDate(activeDate)}
              </Text>
              <Badge variant="secondary" pill>
                {activeSlots.length}{" "}
                {activeSlots.length === 1 ? "window" : "windows"}
              </Badge>
            </div>
            {activeSlots.length > 0 ? (
              <div className="space-y-2">
                {activeSlots.map((slot) => (
                  <Item key={slot.id} size="sm">
                    <ItemMedia>
                      <IconBox variant="success-subtle">
                        <IconClock />
                      </IconBox>
                    </ItemMedia>
                    <ItemContent className="min-w-0 gap-1.5">
                      <ItemTitle>
                        {formatBookingTimeRange(
                          slot.startDate,
                          slot.endDate,
                          TIMEZONE,
                        )}
                      </ItemTitle>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge
                          variant={slot.isRecurring ? "info" : "warning"}
                          pill
                        >
                          {slot.isRecurring ? "Weekly" : "Override"}
                        </Badge>
                        <Badge variant="secondary" pill>
                          {slot.modality === "both"
                            ? "Online & offline"
                            : slot.modality === "offline"
                              ? "Offline"
                              : "Online"}
                        </Badge>
                      </div>
                    </ItemContent>
                    <ItemAction>
                      <Button
                        type="button"
                        variant="danger"
                        size="sm-icon"
                        aria-label={`Remove availability at ${timeValue(slot.startDate)}`}
                        onClick={() => onRequestRemove(slot)}
                      >
                        <IconTrash />
                      </Button>
                    </ItemAction>
                  </Item>
                ))}
              </div>
            ) : (
              <Text className="py-4 text-center text-sm text-muted">
                No availability on this date.
              </Text>
            )}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

function ModalitySelect({
  value,
  onChange,
}: {
  value: Modality;
  onChange: (value: Modality) => void;
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        const modality = getSelectItemValue(next);
        if (
          modality === "online" ||
          modality === "offline" ||
          modality === "both"
        )
          onChange(modality);
      }}
    >
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectPopup>
        <SelectList>
          {MODALITY_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option}>
              {option.icon}
              {option.label}
            </SelectItem>
          ))}
        </SelectList>
      </SelectPopup>
    </Select>
  );
}
