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
  IconSettings,
  IconTrash,
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
import { Checkbox } from "@cogito-app/ui/components/selia/checkbox";
import { DatePicker } from "@cogito-app/ui/components/selia/date-picker";
import { Field, FieldLabel } from "@cogito-app/ui/components/selia/field";
import { Heading } from "@cogito-app/ui/components/selia/heading";
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
import { Stack } from "@cogito-app/ui/components/selia/stack";
import { Text } from "@cogito-app/ui/components/selia/text";
import { toastManager } from "@cogito-app/ui/components/selia/toast";

import { formatBookingTimeRange } from "@/components/booking/booking-ui";
import { MinuteTimeInput } from "@/components/booking/minute-time-input";
import { EmptyState } from "@/components/empty-state";
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
  { value: "online", label: "Online", icon: <IconDeviceLaptop /> },
  { value: "offline", label: "Offline", icon: <IconMapPin /> },
  { value: "both", label: "Both" },
];

const newRange = (): TimeRange => ({
  id: crypto.randomUUID(),
  start: "09:00",
  end: "17:00",
  modality: "online",
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
  if (availability.isPending) return <AvailabilitySkeleton />;

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
  const [overrideDate, setOverrideDate] = useState(() =>
    dateKey(Date.now() + DAY_MS),
  );
  const [override, setOverride] = useState<TimeRange>(newRange);
  const [previewStart, setPreviewStart] = useState(() => weekStart(dateKey()));
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
  const addOverride = useMutation(
    orpc.tutor.upsertAvailability.mutationOptions({
      onSuccess: () => {
        toastManager.add({ title: "Date override added", type: "success" });
        void refresh();
      },
      onError: (error: unknown) =>
        toastManager.add({
          title: "Date override could not be added",
          description: errorMessage(error),
          type: "error",
        }),
    }),
  );
  const removeSlot = useMutation(
    orpc.tutor.deleteAvailability.mutationOptions({
      onSuccess: () => void refresh(),
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
  const hasPreviewSlots = previewDays.some(
    (date) => (slotsByDay.get(date) ?? []).length > 0,
  );

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
    if (override.end <= override.start) return;
    addOverride.mutate({
      startDate: new Date(`${overrideDate}T${override.start}:00+07:00`),
      endDate: new Date(`${overrideDate}T${override.end}:00+07:00`),
      modality: override.modality,
      isRecurring: false,
      isActive: true,
    });
  }

  return (
    <Stack direction="column" spacing="lg">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Heading level={1} size="md">
            Availability
          </Heading>
          <Text className="mt-1 text-muted">
            Set recurring hours once, then add exceptions for specific dates.
          </Text>
        </div>
        <Badge variant="secondary" pill>
          Asia/Jakarta · 90-minute sessions
        </Badge>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.9fr)] xl:items-start">
        <form onSubmit={saveWeekly}>
          <Card>
            <CardHeader>
              <IconBox variant="primary-subtle" size="md">
                <IconClock />
              </IconBox>
              <CardTitle>Weekly hours</CardTitle>
              <CardDescription className="leading-none">
                Choose when students can normally book you.
              </CardDescription>
            </CardHeader>
            <CardBody className="divide-y divide-item-border py-0">
              {DAYS.map(([day, label]) => {
                const value = schedule[day]!;
                return (
                  <div
                    key={day}
                    className="grid gap-3 py-4 sm:grid-cols-[8rem_1fr]"
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

        <div className="space-y-4 xl:sticky xl:top-6">
          <Card>
            <CardHeader>
              <IconBox variant="danger-subtle">
                <IconCalendarEvent />
              </IconBox>
              <CardTitle>Date override</CardTitle>
              <CardDescription className="leading-none">
                Add different hours for one specific date.
              </CardDescription>
            </CardHeader>
            <CardBody>
              <form onSubmit={saveOverride} className="space-y-3">
                <Field>
                  <FieldLabel htmlFor="override-date">Date</FieldLabel>
                  <DatePicker
                    id="override-date"
                    minDate={minimumDate}
                    value={overrideDate}
                    onChange={setOverrideDate}
                  />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <MinuteTimeInput
                    id="override-start"
                    ariaLabel="Override start"
                    value={override.start}
                    onChange={(value) =>
                      setOverride((current) => ({
                        ...current,
                        start: value,
                      }))
                    }
                  />
                  <MinuteTimeInput
                    id="override-end"
                    ariaLabel="Override end"
                    value={override.end}
                    onChange={(value) =>
                      setOverride((current) => ({
                        ...current,
                        end: value,
                      }))
                    }
                  />
                </div>
                <ModalitySelect
                  value={override.modality}
                  onChange={(modality) =>
                    setOverride((current) => ({ ...current, modality }))
                  }
                />
                <Button type="submit" block progress={addOverride.isPending}>
                  <IconPlus /> Add date override
                </Button>
              </form>
            </CardBody>
          </Card>
          <Card>
            <CardHeader>
              <IconBox variant="tertiary">
                <IconSettings />
              </IconBox>
              <CardTitle>Scheduling rules</CardTitle>
              <CardDescription className="leading-none">
                Existing bookings stay reserved when weekly hours change.
              </CardDescription>
            </CardHeader>
            <CardBody className="space-y-3">
              <Rule label="Session duration" value="90 minutes" />
              <Rule label="Timezone" value="Asia/Jakarta" />
              <Rule label="Availability" value="Weekly + overrides" />
            </CardBody>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <IconBox variant="success-subtle">
            <IconCalendarEvent />
          </IconBox>
          <CardTitle>Calendar preview</CardTitle>
          <CardDescription>
            Windows currently visible to students.
          </CardDescription>
        </CardHeader>
        <CardBody>
          <div className="mb-4 flex items-center justify-between">
            <Button
              variant="plain"
              size="sm-icon"
              aria-label="Previous week"
              onClick={() => setPreviewStart((current) => addDays(current, -7))}
            >
              <IconChevronLeft />
            </Button>
            <Text className="font-medium">Week of {previewStart}</Text>
            <Button
              variant="plain"
              size="sm-icon"
              aria-label="Next week"
              onClick={() => setPreviewStart((current) => addDays(current, 7))}
            >
              <IconChevronRight />
            </Button>
          </div>
          {hasPreviewSlots ? (
            <div className="grid gap-2 md:grid-cols-7">
              {previewDays.map((date, index) => (
                <div
                  key={date}
                  className="min-h-40 rounded-lg border border-item-border bg-item p-2"
                >
                  <Text className="text-xs font-medium">
                    {DAYS[index]![2]} · {date.slice(8)}
                  </Text>
                  <div className="mt-2 space-y-2">
                    {(slotsByDay.get(date) ?? []).map((slot) => (
                      <div
                        key={slot.id}
                        className="rounded border border-item-border bg-background p-2"
                      >
                        <Text className="text-xs font-medium">
                          {formatBookingTimeRange(
                            slot.startDate,
                            slot.endDate,
                            TIMEZONE,
                          )}
                        </Text>
                        <div className="mt-1 flex items-center justify-between gap-1">
                          <Badge
                            variant={slot.isRecurring ? "info" : "warning"}
                            pill
                          >
                            {slot.isRecurring ? "Weekly" : "Override"}
                          </Badge>
                          <Button
                            variant="plain"
                            size="xs-icon"
                            aria-label="Remove availability"
                            onClick={() => removeSlot.mutate({ id: slot.id })}
                          >
                            <IconTrash />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<IconCalendarEvent />}
              title="No availability this week"
              description="Save weekly hours or add a date override to show booking windows here."
              tone="secondary"
              size="compact"
            />
          )}
        </CardBody>
      </Card>
    </Stack>
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

function Rule({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <Text className="text-sm text-muted">{label}</Text>
      <Text className="text-sm font-medium">{value}</Text>
    </div>
  );
}

function AvailabilitySkeleton() {
  return (
    <div className="grid animate-pulse gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.6fr)]">
      <Card className="min-h-160 bg-accent/40" />
      <Card className="min-h-96 bg-accent/40" />
    </div>
  );
}
