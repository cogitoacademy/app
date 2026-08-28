"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  IconArrowLeft,
  IconCalendarEvent,
  IconCheck,
  IconClock,
  IconCoins,
  IconDeviceLaptop,
  IconMapPin,
  IconSchool,
  IconWallet,
  IconUsersGroup,
  IconUserPlus,
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
  Field,
  FieldDescription,
  FieldLabel,
} from "@cogito-app/ui/components/selia/field";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { IconBox } from "@cogito-app/ui/components/selia/icon-box";
import { Input } from "@cogito-app/ui/components/selia/input";
import { Textarea } from "@cogito-app/ui/components/selia/textarea";
import { Chip, ChipButton } from "@cogito-app/ui/components/selia/chip";
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

import { EmptyState } from "@/components/empty-state";
import { getUserFacingError } from "@/lib/error-message";
import { orpc } from "@/utils/orpc";
import { getBookingPriceSummary } from "./booking-pricing";
import {
  addMinutesToTime,
  isTimeWithinRange,
  isValidMinuteTime,
  MinuteTimeInput,
} from "@/components/booking/minute-time-input";

const BOOKING_TIMEZONE = "Asia/Jakarta";
const DEFAULT_SOLO_PRICE = 42;

type Modality = "online" | "offline";
type StudentMatch = { id: string; name: string; image: string | null };

function getBookingErrorMessage(error: Error) {
  if (error.message.toLowerCase().includes("input validation failed")) {
    return "Some booking details are no longer valid. Choose the session format and time again, then retry.";
  }

  return getUserFacingError(
    error,
    "Your booking could not be created. Please try again.",
  );
}

function formatSlotDate(value: Date | string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: BOOKING_TIMEZONE,
  }).format(new Date(value));
}

function formatSlotTime(start: Date | string, end: Date | string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: BOOKING_TIMEZONE,
  });
  return `${formatter.format(new Date(start))} - ${formatter.format(new Date(end))} WIB`;
}

function formatDateValue(value: Date | string) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: BOOKING_TIMEZONE,
  }).format(new Date(value));
}

function formatTimeValue(value: Date | string) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: BOOKING_TIMEZONE,
  }).format(new Date(value));
}

export function CreateBookingPage({ tutorId }: { tutorId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedModality, setSelectedModality] = useState<Modality>("online");
  const [selectedSlotIds, setSelectedSlotIds] = useState<string[]>([]);
  const [startTimes, setStartTimes] = useState<Record<string, string>>({});
  const [learningGoal, setLearningGoal] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [debouncedStudentSearch, setDebouncedStudentSearch] = useState("");
  const [invitees, setInvitees] = useState<StudentMatch[]>([]);

  const profileQuery = useQuery(
    orpc.tutors.getProfile.queryOptions({ input: { tutorId } }),
  );
  const walletQuery = useQuery(orpc.wallet.get.queryOptions());
  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedStudentSearch(studentSearch.trim()),
      300,
    );
    return () => window.clearTimeout(timer);
  }, [studentSearch]);

  const studentSearchQuery = useQuery({
    ...orpc.auth.searchStudents.queryOptions({
      input: { query: debouncedStudentSearch || "--", limit: 5 },
    }),
    enabled: debouncedStudentSearch.length >= 2,
    retry: 1,
  });
  const availableStudents = (studentSearchQuery.data ?? []).filter(
    (student) => !invitees.some((invitee) => invitee.id === student.id),
  );
  const isGroupBooking = invitees.length > 0;

  const createBooking = useMutation(
    orpc.booking.createSolo.mutationOptions({
      onSuccess: (booking) => {
        if (
          !booking ||
          typeof booking !== "object" ||
          !("id" in booking) ||
          typeof booking.id !== "string"
        ) {
          toastManager.add({
            title: "Booking created",
            description: "Its details could not be opened automatically.",
            type: "warning",
          });
          void navigate({ to: "/bookings" });
          return;
        }

        void Promise.all([
          queryClient.invalidateQueries({
            queryKey: orpc.booking.listMine.key(),
          }),
          queryClient.invalidateQueries({
            queryKey: orpc.wallet.get.queryKey(),
          }),
        ]);
        toastManager.add({
          title: "Booking request sent",
          description: "Your tutor can now review the request.",
          type: "success",
        });
        void navigate({
          to: "/bookings/$bookingId",
          params: { bookingId: booking.id },
        });
      },
      onError: (error: Error) => {
        toastManager.add({
          title: "Booking request could not be sent",
          description: getBookingErrorMessage(error),
          type: "error",
        });
      },
    }),
  );
  const createSeries = useMutation(
    orpc.booking.createSeries.mutationOptions({
      onSuccess: (booking) => handleCreatedBooking(booking),
      onError: (error: Error) => showBookingError(error),
    }),
  );
  const createGroup = useMutation(
    orpc.booking.createGroup.mutationOptions({
      onSuccess: (booking) => handleCreatedBooking(booking),
      onError: (error: Error) => showBookingError(error),
    }),
  );
  const createGroupSeries = useMutation(
    orpc.booking.createGroupSeries.mutationOptions({
      onSuccess: (booking) => handleCreatedBooking(booking),
      onError: (error: Error) => showBookingError(error),
    }),
  );

  function refreshAfterCreate() {
    return Promise.all([
      queryClient.invalidateQueries({
        queryKey: orpc.booking.listMine.key(),
      }),
      queryClient.invalidateQueries({ queryKey: orpc.wallet.get.queryKey() }),
    ]);
  }

  function handleCreatedBooking(booking: unknown) {
    if (
      !booking ||
      typeof booking !== "object" ||
      !("id" in booking) ||
      typeof booking.id !== "string"
    ) {
      void navigate({ to: "/bookings" });
      return;
    }
    void refreshAfterCreate();
    toastManager.add({
      title:
        selectedSlotIds.length > 1
          ? "Series request sent"
          : "Booking request sent",
      description: "Your tutor can now review the request.",
      type: "success",
    });
    void navigate({
      to: "/bookings/$bookingId",
      params: { bookingId: booking.id },
    });
  }

  function showBookingError(error: Error) {
    toastManager.add({
      title: "Booking request could not be sent",
      description: getBookingErrorMessage(error),
      type: "error",
    });
  }

  if (profileQuery.isPending) return <CreateBookingSkeleton />;

  if (profileQuery.isError) {
    return (
      <Card>
        <CardBody className="flex min-h-72 flex-col items-center justify-center text-center">
          <IconBox variant="danger-subtle" size="lg" className="mb-4">
            <IconSchool />
          </IconBox>
          <Heading size="sm">Tutor details are unavailable</Heading>
          <Text className="mt-2 max-w-md text-muted">
            {getUserFacingError(
              profileQuery.error,
              "This tutor could not be loaded.",
            )}
          </Text>
          <div className="mt-5 flex gap-2">
            <Button
              variant="secondary"
              onClick={() => void profileQuery.refetch()}
            >
              Try again
            </Button>
            <Button
              variant="plain"
              nativeButton={false}
              render={<Link to="/tutors" aria-label="Back to tutors" />}
            >
              Back to tutors
            </Button>
          </div>
        </CardBody>
      </Card>
    );
  }

  const profile = profileQuery.data;
  const effectiveModality: Modality =
    profile.modality === "offline" ? "offline" : selectedModality;
  const modalityOptions: Modality[] =
    profile.modality === "both" ? ["online", "offline"] : [effectiveModality];
  const availabilitySlots = profile.availabilitySlots ?? [];
  const availableSlots = availabilitySlots.filter(
    (slot) => slot.modality === "both" || slot.modality === effectiveModality,
  );
  const selectedSlots = selectedSlotIds
    .map((id) => availableSlots.find((slot) => slot.id === id))
    .filter((slot): slot is (typeof availableSlots)[number] => Boolean(slot))
    .toSorted(
      (a, b) =>
        new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
    );
  const selectedSlot = selectedSlots[0] ?? null;
  const pricesForModality =
    profile.pricesByModality?.[effectiveModality] ?? profile.prices;
  const perSessionPrice = Number(
    pricesForModality?.["1"] ?? DEFAULT_SOLO_PRICE,
  );
  const baseSessionPrice = isGroupBooking
    ? Number(
        pricesForModality?.[String(invitees.length + 1)] ?? perSessionPrice,
      )
    : perSessionPrice;
  const { displayPrice: price, requiredHold } = getBookingPriceSummary({
    perStudentPrice: baseSessionPrice,
    sessionCount: selectedSlots.length,
    isGroupBooking,
    groupSize: invitees.length + 1,
    isGroupSeries: isGroupBooking && selectedSlots.length > 1,
  });
  const availableBalance = walletQuery.data?.availableBalance ?? 0;
  const hasEnoughMarks = availableBalance >= requiredHold;
  const tutorName = profile.displayName ?? profile.user?.name ?? "Cogito tutor";
  const hasInvalidStartTime = selectedSlots.some((slot) => {
    const value = startTimes[slot.id] ?? formatTimeValue(slot.startDate);
    const latestStart = new Date(
      new Date(slot.endDate).getTime() - 90 * 60_000,
    );
    return (
      !isValidMinuteTime(value) ||
      !isTimeWithinRange(
        value,
        formatTimeValue(slot.startDate),
        formatTimeValue(latestStart),
      )
    );
  });

  function submitBooking(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSlot) return;

    const toSessionStart = (slot: (typeof availableSlots)[number]) => {
      const time = startTimes[slot.id] ?? formatTimeValue(slot.startDate);
      return new Date(`${formatDateValue(slot.startDate)}T${time}:00+07:00`);
    };
    if (hasInvalidStartTime) return;

    const baseInput = {
      tutorId: profile.userId,
      availabilitySlotId: selectedSlot.id,
      modality: effectiveModality,
      timezone: BOOKING_TIMEZONE,
      learningGoal: learningGoal.trim(),
    };
    if (isGroupBooking) {
      if (invitees.length > 5) return;
      if (selectedSlots.length > 1) {
        createGroupSeries.mutate({
          ...baseInput,
          targetGroupSize: invitees.length + 1,
          inviteeUserIds: invitees.map((student) => student.id),
          sessions: selectedSlots.map((slot) => ({
            availabilitySlotId: slot.id,
            scheduledStartAt: toSessionStart(slot),
          })),
        });
        return;
      }
      createGroup.mutate({
        ...baseInput,
        targetGroupSize: invitees.length + 1,
        inviteeUserIds: invitees.map((student) => student.id),
        scheduledStartAt: toSessionStart(selectedSlot),
      });
      return;
    }
    if (selectedSlots.length > 1) {
      createSeries.mutate({
        ...baseInput,
        sessions: selectedSlots.map((slot) => ({
          availabilitySlotId: slot.id,
          scheduledStartAt: toSessionStart(slot),
        })),
      });
      return;
    }
    createBooking.mutate({
      ...baseInput,
      scheduledStartAt: toSessionStart(selectedSlot),
    });
  }

  return (
    <Stack direction="column" spacing="lg">
      <div>
        <Button
          variant="underline"
          size="sm"
          nativeButton={false}
          render={<Link to="/tutors" aria-label="Back to tutors" />}
          className="mb-3"
        >
          <IconArrowLeft /> Back to tutors
        </Button>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Badge variant="info" pill>
              {selectedSlots.length > 1
                ? "Session series"
                : isGroupBooking
                  ? "Group session"
                  : "Solo session"}
            </Badge>
            <Heading size="md" className="mt-3">
              Book {tutorName}
            </Heading>
            <Text className="mt-1 text-muted">
              {selectedSlots.length > 1
                ? "Choose 2–4 available times for a recurring learning plan."
                : isGroupBooking
                  ? "Invite friends, choose one time, and review each student's Marks price."
                  : "Choose an available slot and review the Marks hold before sending your request."}
            </Text>
          </div>
          <Badge variant="secondary" pill>
            Asia/Jakarta
          </Badge>
        </div>
      </div>

      <form
        onSubmit={submitBooking}
        className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.65fr)] lg:items-start"
      >
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <IconBox variant="info-subtle">
                <IconSchool />
              </IconBox>
              <CardTitle>Learning goal</CardTitle>
              <CardDescription>
                Help the tutor prepare for your session.
              </CardDescription>
            </CardHeader>
            <CardBody>
              <Field>
                <FieldLabel htmlFor="learning-goal">
                  What do you want to learn?
                </FieldLabel>
                <Textarea
                  id="learning-goal"
                  value={learningGoal}
                  maxLength={2_000}
                  required
                  onChange={(event) => setLearningGoal(event.target.value)}
                  placeholder="Topics, current level, questions, or an outcome you want from the session…"
                />
                <FieldDescription>
                  {learningGoal.length}/2,000 characters
                </FieldDescription>
              </Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <IconBox variant="info-subtle">
                <IconUsersGroup />
              </IconBox>
              <CardTitle>Invite students (optional)</CardTitle>
              <CardDescription>
                Add up to five friends. Adding someone automatically makes this
                a group booking.
              </CardDescription>
            </CardHeader>
            <CardBody className="space-y-3">
              <div className="flex items-center justify-between gap-3 rounded-lg border border-item-border bg-item p-3">
                <div>
                  <Text className="font-medium">
                    {isGroupBooking ? "Group booking" : "Solo booking"}
                  </Text>
                  <Text className="text-sm text-muted">
                    {isGroupBooking
                      ? `${invitees.length + 1} participants including you`
                      : "Invite a student below to switch automatically."}
                  </Text>
                </div>
                <Badge variant={isGroupBooking ? "info" : "secondary"} pill>
                  {invitees.length + 1}/6
                </Badge>
              </div>
              {invitees.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {invitees.map((student) => (
                    <Chip key={student.id}>
                      {student.name}
                      <ChipButton
                        type="button"
                        aria-label={`Remove ${student.name}`}
                        onClick={() =>
                          setInvitees((current) =>
                            current.filter((item) => item.id !== student.id),
                          )
                        }
                      >
                        ×
                      </ChipButton>
                    </Chip>
                  ))}
                </div>
              ) : null}
              <Field>
                <FieldLabel htmlFor="student-search">Find a student</FieldLabel>
                <Input
                  id="student-search"
                  name="student-search"
                  autoComplete="off"
                  value={studentSearch}
                  onChange={(event) => setStudentSearch(event.target.value)}
                  placeholder="Type a name or email…"
                  disabled={invitees.length >= 5}
                />
                <FieldDescription>
                  Search by name or email. Only the student&apos;s name and
                  photo are shown.
                </FieldDescription>
              </Field>
              {studentSearchQuery.isFetching ? (
                <Text className="text-sm text-muted">Searching students…</Text>
              ) : studentSearchQuery.isError ? (
                <div className="flex items-center justify-between gap-3 rounded border border-danger-border bg-danger-subtle p-3">
                  <Text className="text-sm">
                    Student search is temporarily unavailable.
                  </Text>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => void studentSearchQuery.refetch()}
                  >
                    Try again
                  </Button>
                </div>
              ) : debouncedStudentSearch.length >= 2 ? (
                <div className="space-y-2">
                  {availableStudents.map((student) => (
                    <Button
                      key={student.id}
                      type="button"
                      variant="outline"
                      className="h-auto w-full justify-start py-2.5"
                      onClick={() => {
                        setInvitees((current) => [...current, student]);
                        setStudentSearch("");
                        setDebouncedStudentSearch("");
                      }}
                    >
                      <IconUserPlus aria-hidden="true" />
                      <span className="min-w-0 text-left">
                        <span className="block font-medium">
                          {student.name}
                        </span>
                        <span className="block truncate text-xs opacity-70">
                          Email stays private until the student chooses to share
                          it.
                        </span>
                      </span>
                    </Button>
                  ))}
                  {availableStudents.length === 0 ? (
                    <EmptyState
                      icon={<IconUsersGroup />}
                      title="No matching students"
                      description="Try a different name or email address."
                      size="inline"
                      className="px-0 py-3"
                    />
                  ) : null}
                </div>
              ) : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <IconBox variant="info-subtle">
                <IconDeviceLaptop />
              </IconBox>
              <CardTitle>Session format</CardTitle>
              <CardDescription>Choose how you want to meet</CardDescription>
            </CardHeader>
            <CardBody>
              <Field>
                <FieldLabel htmlFor="booking-modality">Modality</FieldLabel>
                <Select
                  value={effectiveModality}
                  onValueChange={(value) => {
                    const modality = getSelectItemValue(value);
                    if (modality !== "online" && modality !== "offline") return;

                    setSelectedModality(modality);
                    setSelectedSlotIds([]);
                    createBooking.reset();
                    createSeries.reset();
                  }}
                  disabled={modalityOptions.length === 1}
                >
                  <SelectTrigger id="booking-modality">
                    <SelectValue placeholder="Choose modality" />
                  </SelectTrigger>
                  <SelectPopup>
                    <SelectList>
                      {modalityOptions.map((modality) => (
                        <SelectItem key={modality} value={modality}>
                          {modality === "online" ? "Online" : "Offline"}
                        </SelectItem>
                      ))}
                    </SelectList>
                  </SelectPopup>
                </Select>
                <FieldDescription>
                  {effectiveModality === "online"
                    ? "The meeting link appears after tutor confirmation."
                    : "Room information appears after approval."}
                </FieldDescription>
              </Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <IconBox variant="success-subtle">
                <IconCalendarEvent />
              </IconBox>
              <CardTitle>Available times</CardTitle>
              <CardDescription>
                Times are displayed in Western Indonesia Time
              </CardDescription>
            </CardHeader>
            <CardBody>
              {availableSlots.length === 0 ? (
                <EmptyState
                  icon={<IconCalendarEvent />}
                  title="No matching slots yet"
                  description={`This tutor has no future ${effectiveModality} availability. Try another modality or tutor.`}
                  tone="secondary"
                  size="compact"
                  className="rounded-lg border border-item-border"
                />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {availableSlots.map((slot) => {
                    const selected = selectedSlotIds.includes(slot.id);
                    return (
                      <div key={slot.id} className="contents">
                        <Button
                          type="button"
                          variant={selected ? "primary" : "outline"}
                          aria-pressed={selected}
                          className="h-auto min-h-20 justify-start px-4 py-3 text-left"
                          onClick={() => {
                            setSelectedSlotIds((current) => {
                              if (current.includes(slot.id)) {
                                return current.filter((id) => id !== slot.id);
                              }
                              return current.length < 4
                                ? [...current, slot.id]
                                : current;
                            });
                            createBooking.reset();
                            createSeries.reset();
                          }}
                        >
                          <span className="flex min-w-0 flex-col items-start gap-1">
                            <span className="font-medium">
                              {formatSlotDate(slot.startDate)}
                            </span>
                            <span className="flex items-center gap-1.5 text-sm opacity-80">
                              <IconClock
                                className="size-4"
                                aria-hidden="true"
                              />
                              {formatSlotTime(slot.startDate, slot.endDate)}
                            </span>
                          </span>
                          {selected ? (
                            <IconCheck className="ml-auto" aria-hidden="true" />
                          ) : null}
                        </Button>
                        {selected ? (
                          <div className="rounded-lg border border-item-border bg-item p-3 sm:col-span-2">
                            <Field>
                              <FieldLabel htmlFor={`start-${slot.id}`}>
                                Session start
                              </FieldLabel>
                              <MinuteTimeInput
                                id={`start-${slot.id}`}
                                value={
                                  startTimes[slot.id] ??
                                  formatTimeValue(slot.startDate)
                                }
                                onChange={(value) =>
                                  setStartTimes((current) => ({
                                    ...current,
                                    [slot.id]: value,
                                  }))
                                }
                                minTime={formatTimeValue(slot.startDate)}
                                maxTime={formatTimeValue(
                                  new Date(
                                    new Date(slot.endDate).getTime() -
                                      90 * 60_000,
                                  ),
                                )}
                              />
                              <FieldDescription>
                                Fixed 90 minutes · ends at{" "}
                                {addMinutesToTime(
                                  startTimes[slot.id] ??
                                    formatTimeValue(slot.startDate),
                                  90,
                                )}{" "}
                                WIB · valid starts{" "}
                                {formatTimeValue(slot.startDate)}–
                                {formatTimeValue(
                                  new Date(
                                    new Date(slot.endDate).getTime() -
                                      90 * 60_000,
                                  ),
                                )}{" "}
                                WIB
                              </FieldDescription>
                            </Field>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        <Card className="lg:sticky lg:top-6">
          <CardHeader>
            <IconBox variant="warning-subtle">
              <IconCoins />
            </IconBox>
            <CardTitle>Booking summary</CardTitle>
            <CardDescription>Review before requesting</CardDescription>
          </CardHeader>
          <CardBody className="space-y-5">
            <SummaryRow label="Tutor" value={tutorName} />
            <SummaryRow
              label="Modality"
              value={effectiveModality === "online" ? "Online" : "Offline"}
              icon={
                effectiveModality === "online" ? (
                  <IconDeviceLaptop />
                ) : (
                  <IconMapPin />
                )
              }
            />
            <SummaryRow
              label="Schedule"
              value={
                selectedSlots.length > 1
                  ? selectedSlots.length > 0
                    ? `${selectedSlots.length} of 2–4 sessions selected`
                    : "Choose 2–4 times"
                  : selectedSlot
                    ? `${formatSlotDate(selectedSlot.startDate)}, ${formatSlotTime(selectedSlot.startDate, selectedSlot.endDate)}`
                    : "Choose a time"
              }
            />
            <div className="rounded-lg border border-item-border bg-item p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Text className="text-sm text-muted">
                    {selectedSlots.length > 1
                      ? "Series total"
                      : isGroupBooking
                        ? "Price per student"
                        : "Session price"}
                  </Text>
                  <Text className="text-xl font-semibold">{price} Marks</Text>
                  {selectedSlots.length > 1 ? (
                    <Text className="text-xs text-muted">
                      {baseSessionPrice} Marks per session
                    </Text>
                  ) : null}
                </div>
                <IconBox variant="warning-subtle">
                  <IconCoins />
                </IconBox>
              </div>
              <Text className="mt-3 text-sm text-muted">
                Held now and only deducted according to the booking lifecycle.
              </Text>
              {isGroupBooking && selectedSlots.length === 1 ? (
                <Text className="mt-2 text-xs text-muted">
                  A temporary hold covers {invitees.length + 1} target
                  participants. Excess Marks are released as invitees confirm.
                </Text>
              ) : null}
            </div>
            {isGroupBooking && selectedSlots.length === 1 ? (
              <SummaryRow
                label="Temporary hold"
                value={`${requiredHold} Marks`}
              />
            ) : null}
            <div className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-2 text-muted">
                <IconWallet className="size-4" aria-hidden="true" /> Available
              </span>
              <Text className="font-medium">
                {walletQuery.isPending
                  ? "Loading…"
                  : `${availableBalance} Marks`}
              </Text>
            </div>
            {!walletQuery.isPending && !hasEnoughMarks ? (
              <div className="rounded-lg border border-danger-border bg-danger/10 p-3">
                <Text className="text-sm text-danger">
                  You need {requiredHold - availableBalance} more Marks for the
                  temporary hold.
                </Text>
              </div>
            ) : null}
          </CardBody>
          <CardFooter className="flex-col">
            {walletQuery.isPending ? (
              <Button block size="lg" disabled progress>
                Checking balance…
              </Button>
            ) : hasEnoughMarks ? (
              <Button
                type="submit"
                block
                size="lg"
                progress={
                  createBooking.isPending ||
                  createGroup.isPending ||
                  createSeries.isPending ||
                  createGroupSeries.isPending
                }
                disabled={
                  !selectedSlot ||
                  hasInvalidStartTime ||
                  createBooking.isPending ||
                  createGroup.isPending ||
                  createSeries.isPending ||
                  createGroupSeries.isPending ||
                  !learningGoal.trim() ||
                  invitees.length > 5
                }
              >
                {selectedSlots.length > 1
                  ? `Send series request (${selectedSlots.length})`
                  : isGroupBooking
                    ? "Send group booking request"
                    : "Send booking request"}
              </Button>
            ) : (
              <Button
                block
                size="lg"
                nativeButton={false}
                render={<Link to="/balance" aria-label="Top up Marks" />}
              >
                Top up Marks
              </Button>
            )}
            {createBooking.isError ||
            createGroup.isError ||
            createSeries.isError ||
            createGroupSeries.isError ? (
              <div className="w-full rounded-lg border border-danger-border bg-danger/10 p-3">
                <Text className="text-center text-sm text-danger">
                  {getBookingErrorMessage(
                    (createBooking.error ??
                      createGroup.error ??
                      createSeries.error ??
                      createGroupSeries.error) as Error,
                  )}
                </Text>
              </div>
            ) : null}
            <Text className="text-center text-xs text-muted">
              The tutor will review your request before the session is
              confirmed.
            </Text>
          </CardFooter>
        </Card>
      </form>
    </Stack>
  );
}

function SummaryRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <Text className="shrink-0 text-sm text-muted">{label}</Text>
      <span className="flex items-center gap-1.5 text-right font-medium">
        {icon ? <span className="[&>svg]:size-4">{icon}</span> : null}
        {value}
      </span>
    </div>
  );
}

function CreateBookingSkeleton() {
  return (
    <div className="grid animate-pulse gap-4 lg:grid-cols-[1.35fr_0.65fr]">
      <div className="space-y-4">
        <div className="h-24 rounded-xl bg-accent" />
        <div className="h-72 rounded-xl bg-accent" />
      </div>
      <div className="h-96 rounded-xl bg-accent" />
    </div>
  );
}
