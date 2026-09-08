"use client";

import { type ReactNode, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  IconArrowLeft,
  IconCalendarEvent,
  IconChevronLeft,
  IconChevronRight,
  IconChevronUp,
  IconCoins,
  IconDeviceLaptop,
  IconEye,
  IconMapPin,
  IconSchool,
  IconWallet,
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
  CardFooter,
  CardHeader,
  CardInfoPreview,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@cogito-app/ui/components/selia/field";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import {
  Drawer,
  DrawerBody,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerPopup,
  DrawerTitle,
} from "@cogito-app/ui/components/selia/drawer";
import { IconBox } from "@cogito-app/ui/components/selia/icon-box";
import { Input } from "@cogito-app/ui/components/selia/input";
import { InputGroup } from "@cogito-app/ui/components/selia/input-group";
import { Separator } from "@cogito-app/ui/components/selia/separator";
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
import { Tabs, TabsItem, TabsList } from "@cogito-app/ui/components/selia/tabs";
import { Text } from "@cogito-app/ui/components/selia/text";
import { toastManager } from "@cogito-app/ui/components/selia/toast";

import { EmptyState } from "@/components/empty-state";
import { CogitoMarks } from "@/components/cogito-marks";
import { InfoPreview } from "@/components/info-preview";
import { TutorDrawer } from "@/components/tutor/tutor-drawer";
import { getUserFacingError } from "@/lib/error-message";
import { orpc } from "@/utils/orpc";
import { getBookingPriceSummary } from "./booking-pricing";
import {
  addMinutesToTime,
  isTimeWithinRange,
  isValidMinuteTime,
} from "@/components/booking/minute-time-input";
import {
  formatDateValue,
  formatTimeValue,
  toSessionStart,
} from "@/components/booking/booking-session-time";

const BOOKING_TIMEZONE = "Asia/Jakarta";
const DEFAULT_SOLO_PRICE = 42;

type Modality = "online" | "offline";
type StudentMatch = { id: string; name: string; image: string | null };
type SelectedSession = {
  key: string;
  slotId: string;
  time: string;
};

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

function formatDatePart(value: Date | string, part: "weekday" | "dayMonth") {
  return new Intl.DateTimeFormat("en-US", {
    weekday: part === "weekday" ? "short" : undefined,
    day: part === "dayMonth" ? "numeric" : undefined,
    month: part === "dayMonth" ? "short" : undefined,
    timeZone: BOOKING_TIMEZONE,
  }).format(new Date(value));
}

function addCalendarDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00+07:00`);
  value.setUTCDate(value.getUTCDate() + days);
  return value;
}

function getAvailableStartTimes(start: Date | string, end: Date | string) {
  const firstStart = new Date(start);
  const latestStart = new Date(new Date(end).getTime() - 90 * 60_000);
  const times: string[] = [];
  for (
    let cursor = firstStart;
    cursor <= latestStart;
    cursor = new Date(cursor.getTime() + 15 * 60_000)
  ) {
    times.push(formatTimeValue(cursor, BOOKING_TIMEZONE));
  }
  return times;
}

function getTimePeriod(time: string) {
  const hour = Number(time.slice(0, 2));
  if (hour < 12) return "Morning";
  if (hour < 18) return "Afternoon";
  return "Evening";
}

function sessionTimesOverlap(
  firstStart: Date,
  secondStart: Date,
  durationMinutes = 90,
) {
  const durationMs = durationMinutes * 60_000;
  return (
    firstStart.getTime() < secondStart.getTime() + durationMs &&
    secondStart.getTime() < firstStart.getTime() + durationMs
  );
}

export function CreateBookingPage({ tutorId }: { tutorId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedModality, setSelectedModality] = useState<Modality>("online");
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [selectedSessions, setSelectedSessions] = useState<SelectedSession[]>(
    [],
  );
  const [compactDateStrip, setCompactDateStrip] = useState(false);
  const [availabilityPage, setAvailabilityPage] = useState(0);
  const [selectedAvailabilityDate, setSelectedAvailabilityDate] = useState("");
  const [sessionNotes, setSessionNotes] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [debouncedStudentSearch, setDebouncedStudentSearch] = useState("");
  const [invitees, setInvitees] = useState<StudentMatch[]>([]);
  const [tutorProfileOpen, setTutorProfileOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 639px)");
    const syncDateStrip = () => {
      setCompactDateStrip(mediaQuery.matches);
      setAvailabilityPage(0);
      setSelectedAvailabilityDate("");
    };
    syncDateStrip();
    mediaQuery.addEventListener("change", syncDateStrip);
    return () => mediaQuery.removeEventListener("change", syncDateStrip);
  }, []);

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

  function addInvitee(student: StudentMatch) {
    setInvitees((current) =>
      current.length < 5 && !current.some(({ id }) => id === student.id)
        ? [...current, student]
        : current,
    );
    setStudentSearch("");
    setDebouncedStudentSearch("");
  }

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
        selectedSessions.length > 1
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
  const subjects = profile.subjects ?? [];
  const effectiveSubjectId =
    selectedSubjectId || (subjects.length === 1 ? subjects[0]!.id : "");
  const selectedSubject =
    subjects.find((subject) => subject.id === effectiveSubjectId) ?? null;
  const effectiveModality: Modality =
    profile.modality === "offline" ? "offline" : selectedModality;
  const modalityOptions: Modality[] =
    profile.modality === "both" ? ["online", "offline"] : [effectiveModality];
  const availabilitySlots = profile.availabilitySlots ?? [];
  const availableSlots = availabilitySlots.filter(
    (slot) => slot.modality === "both" || slot.modality === effectiveModality,
  );
  const availableSlotsByDate = Map.groupBy(availableSlots, (slot) =>
    formatDateValue(slot.startDate, BOOKING_TIMEZONE),
  );
  const availabilityDates = [...availableSlotsByDate.entries()];
  const availabilityPageSize = compactDateStrip ? 3 : 7;
  const firstAvailabilityDate = availabilityDates[0]?.[0];
  const lastAvailabilityDate = availabilityDates.at(-1)?.[0];
  const availabilityDaySpan =
    firstAvailabilityDate && lastAvailabilityDate
      ? Math.floor(
          (addCalendarDays(lastAvailabilityDate, 0).getTime() -
            addCalendarDays(firstAvailabilityDate, 0).getTime()) /
            86_400_000,
        ) + 1
      : 0;
  const availabilityPageCount = Math.ceil(
    availabilityDaySpan / availabilityPageSize,
  );
  const visibleAvailabilityDates = firstAvailabilityDate
    ? Array.from({ length: availabilityPageSize }, (_, index) => {
        const value = addCalendarDays(
          firstAvailabilityDate,
          availabilityPage * availabilityPageSize + index,
        );
        const date = formatDateValue(value, BOOKING_TIMEZONE);
        return { date, value, slots: availableSlotsByDate.get(date) ?? [] };
      })
    : [];
  const activeAvailabilityDate = availabilityDates.some(
    ([date]) => date === selectedAvailabilityDate,
  )
    ? selectedAvailabilityDate
    : visibleAvailabilityDates.find(({ slots }) => slots.length > 0)?.date;
  const activeDateSlots = activeAvailabilityDate
    ? (availableSlotsByDate.get(activeAvailabilityDate) ?? [])
    : [];
  const availableStartOptions = activeDateSlots.flatMap((slot) =>
    getAvailableStartTimes(slot.startDate, slot.endDate).map((time) => ({
      slot,
      time,
    })),
  );
  const startOptionsByPeriod = Map.groupBy(availableStartOptions, ({ time }) =>
    getTimePeriod(time),
  );
  const selectedSlots = selectedSessions
    .flatMap((selection) => {
      const slot = availableSlots.find(({ id }) => id === selection.slotId);
      return slot ? [{ ...slot, ...selection }] : [];
    })
    .toSorted(
      (a, b) =>
        toSessionStart(a.startDate, a.time, BOOKING_TIMEZONE).getTime() -
        toSessionStart(b.startDate, b.time, BOOKING_TIMEZONE).getTime(),
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
  const tutorName = profile.user?.name ?? "Cogito tutor";
  const hasInvalidStartTime = selectedSlots.some((slot) => {
    const value = slot.time;
    const latestStart = new Date(
      new Date(slot.endDate).getTime() - 90 * 60_000,
    );
    return (
      !isValidMinuteTime(value) ||
      !isTimeWithinRange(
        value,
        formatTimeValue(slot.startDate, BOOKING_TIMEZONE),
        formatTimeValue(latestStart, BOOKING_TIMEZONE),
      )
    );
  });
  const createPending =
    createBooking.isPending ||
    createGroup.isPending ||
    createSeries.isPending ||
    createGroupSeries.isPending;
  const submitDisabled =
    !selectedSlot ||
    hasInvalidStartTime ||
    createPending ||
    !sessionNotes.trim() ||
    (subjects.length > 0 && !effectiveSubjectId) ||
    invitees.length > 5;
  const submitLabel =
    selectedSlots.length > 1
      ? `Send series request (${selectedSlots.length})`
      : isGroupBooking
        ? "Send group booking request"
        : "Send booking request";
  const scheduleSummary =
    selectedSlots.length > 1
      ? `${selectedSlots.length} of 2–4 sessions selected`
      : selectedSlot
        ? `${formatSlotDate(selectedSlot.startDate)}, ${selectedSlot.time}–${addMinutesToTime(selectedSlot.time, 90)} WIB`
        : "Choose a time";

  function submitBooking(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSlot) return;

    const buildSessionStart = (slot: (typeof selectedSlots)[number]) =>
      toSessionStart(slot.startDate, slot.time, BOOKING_TIMEZONE);
    if (hasInvalidStartTime) return;

    const baseInput = {
      tutorId: profile.userId,
      subjectId: effectiveSubjectId || undefined,
      availabilitySlotId: selectedSlot.id,
      modality: effectiveModality,
      timezone: BOOKING_TIMEZONE,
      // Keep the existing API field for compatibility while the booking UI
      // presents this as one flexible Session Notes field.
      learningGoal: sessionNotes.trim(),
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
            scheduledStartAt: buildSessionStart(slot),
          })),
        });
        return;
      }
      createGroup.mutate({
        ...baseInput,
        targetGroupSize: invitees.length + 1,
        inviteeUserIds: invitees.map((student) => student.id),
        scheduledStartAt: buildSessionStart(selectedSlot),
      });
      return;
    }
    if (selectedSlots.length > 1) {
      createSeries.mutate({
        ...baseInput,
        sessions: selectedSlots.map((slot) => ({
          availabilitySlotId: slot.id,
          scheduledStartAt: buildSessionStart(slot),
        })),
      });
      return;
    }
    createBooking.mutate({
      ...baseInput,
      scheduledStartAt: buildSessionStart(selectedSlot),
    });
  }

  return (
    <Stack direction="column" spacing="lg" className="pb-24 lg:pb-0">
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
            <Heading level={1} size="md" className="mt-3">
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
          <Button
            type="button"
            variant="secondary"
            className="w-full shrink-0 sm:w-auto"
            aria-expanded={tutorProfileOpen}
            onClick={() => setTutorProfileOpen(true)}
          >
            <IconEye />
            View tutor profile
          </Button>
        </div>
      </div>

      <form
        id="create-booking-form"
        onSubmit={submitBooking}
        className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.65fr)] lg:items-start"
      >
        <div className="order-2 space-y-4 lg:order-1">
          <Card>
            <CardHeader>
              <IconBox variant="info-subtle">
                <IconSchool />
              </IconBox>
              <CardTitle>
                Session details
                <CardInfoPreview>
                  <InfoPreview
                    title="Session details"
                    description="Choose a specialization and tell the tutor what you want to work on."
                    label="About session details"
                  />
                </CardInfoPreview>
              </CardTitle>
            </CardHeader>
            <CardBody>
              <fieldset className="flex flex-col gap-5">
                <legend className="sr-only">Session details</legend>
                {subjects.length > 0 ? (
                  <Field>
                    <FieldLabel htmlFor="booking-subject">
                      Specialization
                    </FieldLabel>
                    <Select
                      value={effectiveSubjectId}
                      onValueChange={(value) => {
                        const subjectId = getSelectItemValue(value);
                        if (typeof subjectId !== "string") return;
                        setSelectedSubjectId(subjectId);
                      }}
                      disabled={subjects.length === 1}
                    >
                      <SelectTrigger id="booking-subject">
                        <SelectValue placeholder="Choose a session topic" />
                      </SelectTrigger>
                      <SelectPopup>
                        <SelectList>
                          {subjects.map((subject) => (
                            <SelectItem key={subject.id} value={subject.id}>
                              {subject.parent.name} — {subject.name}
                            </SelectItem>
                          ))}
                        </SelectList>
                      </SelectPopup>
                    </Select>
                    <FieldDescription>
                      {selectedSubject
                        ? `${selectedSubject.parent.name} - ${selectedSubject.name}`
                        : "This appears in the Calendar and Google Meet details."}
                    </FieldDescription>
                  </Field>
                ) : (
                  <Text className="text-sm text-muted">
                    This tutor has no competition topic configured yet. You can
                    still send the booking request.
                  </Text>
                )}
                <Field>
                  <FieldLabel htmlFor="session-notes">
                    What would you like to focus on?
                  </FieldLabel>
                  <Textarea
                    id="session-notes"
                    value={sessionNotes}
                    maxLength={2_000}
                    required
                    onChange={(event) => setSessionNotes(event.target.value)}
                    placeholder="Share your learning goal, topics, questions, or reference links…"
                  />
                  <FieldDescription>
                    Paste any useful reference links here. {sessionNotes.length}
                    /2,000 characters
                  </FieldDescription>
                </Field>
                <Separator />
                <div className="space-y-1">
                  <Text className="font-medium">Participants (optional)</Text>
                  <Text className="text-sm text-muted">
                    Invite up to five students. Adding someone makes this a
                    group booking.
                  </Text>
                </div>
                <Field>
                  <FieldLabel htmlFor="student-search" className="sr-only">
                    Find a student
                  </FieldLabel>
                  {invitees.length > 0 ? (
                    <div
                      className="flex flex-wrap gap-1.5"
                      aria-label="Invited students"
                    >
                      {invitees.map((student) => (
                        <Chip
                          key={student.id}
                          pill
                          className="h-7 max-w-full gap-1.5 pl-1 pr-1.5"
                        >
                          <Avatar size="sm" className="size-5!">
                            <AvatarImage src={student.image ?? undefined} />
                            <AvatarFallback className="text-[9px]">
                              {student.name.slice(0, 1).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span className="max-w-36 truncate">
                            {student.name}
                          </span>
                          <ChipButton
                            type="button"
                            aria-label={`Remove ${student.name}`}
                            onClick={() =>
                              setInvitees((current) =>
                                current.filter(
                                  (item) => item.id !== student.id,
                                ),
                              )
                            }
                          >
                            <IconX aria-hidden="true" className="size-3.5" />
                          </ChipButton>
                        </Chip>
                      ))}
                    </div>
                  ) : null}
                  <div className="relative">
                    <InputGroup className="min-w-0 rounded-full">
                      <Input
                        id="student-search"
                        name="student-search"
                        autoComplete="off"
                        value={studentSearch}
                        onChange={(event) =>
                          setStudentSearch(event.target.value)
                        }
                        onKeyDown={(event) => {
                          if (event.key !== "Enter" || !availableStudents[0])
                            return;
                          event.preventDefault();
                          addInvitee(availableStudents[0]);
                        }}
                        placeholder={
                          invitees.length > 0
                            ? "Add another…"
                            : "Type a name or email…"
                        }
                        disabled={invitees.length >= 5}
                      />
                    </InputGroup>
                    {studentSearchQuery.isFetching ||
                    studentSearchQuery.isError ||
                    debouncedStudentSearch.length >= 2 ? (
                      <div className="absolute inset-x-0 top-full z-30 mt-2 rounded-lg border border-popover-border bg-popover p-1.5 text-popover-foreground shadow-popover">
                        {studentSearchQuery.isFetching ? (
                          <Text className="px-2.5 py-2 text-sm text-muted">
                            Searching students…
                          </Text>
                        ) : studentSearchQuery.isError ? (
                          <div className="flex items-center justify-between gap-3 p-1">
                            <Text className="text-sm text-danger">
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
                        ) : (
                          <div
                            role="listbox"
                            aria-label="Student search results"
                          >
                            {availableStudents.map((student) => (
                              <Button
                                key={student.id}
                                type="button"
                                variant="plain"
                                className="h-auto w-full justify-start rounded px-2.5 py-2"
                                onClick={() => addInvitee(student)}
                              >
                                <Avatar size="sm" className="size-7!">
                                  <AvatarImage
                                    src={student.image ?? undefined}
                                  />
                                  <AvatarFallback className="text-xs">
                                    {student.name.slice(0, 1).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="min-w-0 truncate text-left font-medium">
                                  {student.name}
                                </span>
                              </Button>
                            ))}
                            {availableStudents.length === 0 ? (
                              <Text className="px-2.5 py-2 text-sm text-muted">
                                No matching students. Try a different name or
                                email.
                              </Text>
                            ) : null}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                  <Text className="text-xs text-muted">
                    {isGroupBooking
                      ? `${invitees.length + 1}/6 participants including you`
                      : "Add up to five students to make this a group booking."}
                  </Text>
                </Field>
              </fieldset>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <IconBox variant="success-subtle">
                <IconCalendarEvent />
              </IconBox>
              <CardTitle>
                Available times
                <CardInfoPreview>
                  <InfoPreview
                    title="Available times"
                    description="Times are displayed in Western Indonesia Time. Choose up to four starts; series sessions may be on the same day."
                    label="About available times"
                    tone="success"
                  />
                </CardInfoPreview>
              </CardTitle>
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
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Tabs
                      value={effectiveModality}
                      onValueChange={(modality) => {
                        if (modality !== "online" && modality !== "offline")
                          return;
                        setSelectedModality(modality);
                        setSelectedSessions([]);
                        setAvailabilityPage(0);
                        setSelectedAvailabilityDate("");
                        createBooking.reset();
                        createSeries.reset();
                      }}
                    >
                      <TabsList aria-label="Session format">
                        {modalityOptions.map((modality) => (
                          <TabsItem key={modality} value={modality}>
                            {modality === "online" ? (
                              <IconDeviceLaptop aria-hidden="true" />
                            ) : (
                              <IconMapPin aria-hidden="true" />
                            )}
                            {modality === "online" ? "Online" : "Offline"}
                          </TabsItem>
                        ))}
                      </TabsList>
                    </Tabs>
                    <Text className="text-sm text-muted">
                      {effectiveModality === "online"
                        ? "The meeting link appears after tutor confirmation."
                        : "Room information appears after approval."}
                    </Text>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="plain"
                      size="icon"
                      aria-label="Previous available dates"
                      disabled={availabilityPage === 0}
                      onClick={() => {
                        const nextPage = Math.max(0, availabilityPage - 1);
                        setAvailabilityPage(nextPage);
                        setSelectedAvailabilityDate(
                          firstAvailabilityDate
                            ? (Array.from(
                                { length: availabilityPageSize },
                                (_, index) =>
                                  formatDateValue(
                                    addCalendarDays(
                                      firstAvailabilityDate,
                                      nextPage * availabilityPageSize + index,
                                    ),
                                    BOOKING_TIMEZONE,
                                  ),
                              ).find((date) =>
                                availableSlotsByDate.has(date),
                              ) ?? "")
                            : "",
                        );
                      }}
                    >
                      <IconChevronLeft aria-hidden="true" />
                    </Button>
                    <div className="grid min-w-0 flex-1 grid-cols-3 gap-1 sm:grid-cols-7">
                      {visibleAvailabilityDates.map(
                        ({ date, value, slots }) => {
                          const active = date === activeAvailabilityDate;
                          const available = slots.length > 0;
                          return (
                            <Button
                              key={date}
                              type="button"
                              variant={active ? "tertiary" : "plain"}
                              aria-pressed={active}
                              disabled={!available}
                              className="min-w-0 flex-col gap-0.5 px-1 py-6"
                              onClick={() => setSelectedAvailabilityDate(date)}
                            >
                              <span className="text-xs opacity-70">
                                {formatDatePart(value, "weekday")}
                              </span>
                              <span className="font-medium">
                                {formatDatePart(value, "dayMonth")}
                              </span>
                            </Button>
                          );
                        },
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="plain"
                      size="icon"
                      aria-label="Next available dates"
                      disabled={availabilityPage >= availabilityPageCount - 1}
                      onClick={() => {
                        const nextPage = Math.min(
                          availabilityPageCount - 1,
                          availabilityPage + 1,
                        );
                        setAvailabilityPage(nextPage);
                        setSelectedAvailabilityDate(
                          firstAvailabilityDate
                            ? (Array.from(
                                { length: availabilityPageSize },
                                (_, index) =>
                                  formatDateValue(
                                    addCalendarDays(
                                      firstAvailabilityDate,
                                      nextPage * availabilityPageSize + index,
                                    ),
                                    BOOKING_TIMEZONE,
                                  ),
                              ).find((date) =>
                                availableSlotsByDate.has(date),
                              ) ?? "")
                            : "",
                        );
                      }}
                    >
                      <IconChevronRight aria-hidden="true" />
                    </Button>
                  </div>
                  <div className="rounded-lg border border-item-border bg-item p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <Text className="font-medium">
                          {activeDateSlots[0]
                            ? formatSlotDate(activeDateSlots[0].startDate)
                            : "Choose a date"}
                        </Text>
                        <Text className="text-sm text-muted">
                          Choose a 90-minute session start
                        </Text>
                      </div>
                      <Badge variant="secondary" pill>
                        {availableStartOptions.length} times
                      </Badge>
                    </div>
                    <div className="space-y-4">
                      {[...startOptionsByPeriod.entries()].map(
                        ([period, options]) => (
                          <div key={period} className="space-y-2">
                            <Text className="text-sm font-medium text-muted">
                              {period}
                            </Text>
                            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                              {options.map(({ slot, time }) => {
                                const selectionKey = `${slot.id}:${time}`;
                                const selected = selectedSessions.some(
                                  ({ key }) => key === selectionKey,
                                );
                                const candidateStart = toSessionStart(
                                  slot.startDate,
                                  time,
                                  BOOKING_TIMEZONE,
                                );
                                const overlapsSelected =
                                  !selected &&
                                  selectedSlots.some((existing) =>
                                    sessionTimesOverlap(
                                      candidateStart,
                                      toSessionStart(
                                        existing.startDate,
                                        existing.time,
                                        BOOKING_TIMEZONE,
                                      ),
                                    ),
                                  );
                                return (
                                  <Button
                                    key={`${slot.id}-${time}`}
                                    type="button"
                                    size="sm"
                                    variant={selected ? "primary" : "outline"}
                                    aria-pressed={selected}
                                    disabled={
                                      overlapsSelected ||
                                      (!selected &&
                                        selectedSessions.length >= 4)
                                    }
                                    onClick={() => {
                                      setSelectedSessions((current) =>
                                        selected
                                          ? current.filter(
                                              ({ key }) => key !== selectionKey,
                                            )
                                          : current.length < 4
                                            ? [
                                                ...current,
                                                {
                                                  key: selectionKey,
                                                  slotId: slot.id,
                                                  time,
                                                },
                                              ]
                                            : current,
                                      );
                                      createBooking.reset();
                                      createSeries.reset();
                                    }}
                                  >
                                    {time}
                                  </Button>
                                );
                              })}
                            </div>
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                  {selectedSlots.length > 0 ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <Text className="font-medium">Selected sessions</Text>
                        <Badge variant="info" pill>
                          {selectedSlots.length}/4
                        </Badge>
                      </div>
                      <div className="grid gap-6 sm:grid-cols-2">
                        {selectedSlots.map((slot) => {
                          const startTime = slot.time;
                          return (
                            <div
                              key={slot.key}
                              className="flex items-center justify-between gap-3 rounded-lg bg-item"
                            >
                              <div className="min-w-0">
                                <Text className="truncate font-medium">
                                  {formatSlotDate(slot.startDate)}
                                </Text>
                                <Text className="text-sm text-muted">
                                  {startTime}–{addMinutesToTime(startTime, 90)}{" "}
                                  WIB
                                </Text>
                              </div>
                              <Button
                                type="button"
                                variant="danger"
                                size="sm"
                                aria-label={`Remove ${formatSlotDate(slot.startDate)} at ${startTime}`}
                                onClick={() =>
                                  setSelectedSessions((current) =>
                                    current.filter(
                                      ({ key }) => key !== slot.key,
                                    ),
                                  )
                                }
                              >
                                Remove
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="order-1 space-y-4 lg:order-2 lg:sticky lg:top-6">
          <Card className="hidden lg:block">
            <CardHeader>
              <IconBox variant="warning-subtle">
                <IconCoins />
              </IconBox>
              <CardTitle>
                Booking summary
                <CardInfoPreview>
                  <InfoPreview
                    title="Booking summary"
                    description="Review the tutor, format, schedule, and Marks hold before requesting."
                    label="About booking summary"
                    tone="warning"
                  />
                </CardInfoPreview>
              </CardTitle>
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
              <SummaryRow label="Schedule" value={scheduleSummary} />
              <div className="">
                <div className="flex items-center justify-between gap-4">
                  <Text className="text-sm text-muted">
                    {isGroupBooking ? "Price per student" : "Session price"}
                  </Text>
                  <Text className="text-base font-semibold">
                    <CogitoMarks value={price} size="3" />
                  </Text>
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
              <Separator />
              {isGroupBooking && selectedSlots.length === 1 ? (
                <SummaryRow
                  label="Temporary hold"
                  value={<CogitoMarks value={requiredHold} />}
                />
              ) : null}
              <div className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-2 text-muted">
                  <IconWallet className="size-4" aria-hidden="true" /> Available
                </span>
                <Text className="font-medium">
                  {walletQuery.isPending ? (
                    "Loading…"
                  ) : (
                    <CogitoMarks value={availableBalance} />
                  )}
                </Text>
              </div>
              {!walletQuery.isPending && !hasEnoughMarks ? (
                <div className="rounded-lg border border-danger-border bg-danger/10 p-3">
                  <Text className="flex flex-wrap items-center gap-1 text-sm text-danger">
                    <span>You need</span>
                    <CogitoMarks
                      value={requiredHold - availableBalance}
                      size="3"
                    />
                    <span>more for the temporary hold.</span>
                  </Text>
                </div>
              ) : null}
            </CardBody>
            <CardFooter className="flex-col">
              {walletQuery.isPending ? (
                <Button block size="md" disabled progress>
                  Checking balance…
                </Button>
              ) : hasEnoughMarks ? (
                <Button
                  type="submit"
                  block
                  size="md"
                  progress={createPending}
                  disabled={submitDisabled}
                >
                  {submitLabel}
                </Button>
              ) : (
                <Button
                  block
                  size="md"
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
            </CardFooter>
          </Card>
        </div>
      </form>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 shadow-popover backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-7xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <Text className="truncate text-xs text-muted">
              {scheduleSummary}
            </Text>
            <Text className="font-semibold">
              <CogitoMarks value={price} />
            </Text>
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setSummaryOpen(true)}
          >
            Review <IconChevronUp />
          </Button>
        </div>
      </div>

      <TutorDrawer
        tutor={profile}
        open={tutorProfileOpen}
        onOpenChange={setTutorProfileOpen}
        showBookingAction={false}
      />

      <Drawer
        open={summaryOpen}
        onOpenChange={setSummaryOpen}
        swipeDirection="down"
      >
        <DrawerPopup direction="bottom" className="z-50 lg:hidden">
          <DrawerHeader className="flex-col items-start gap-1.5 border-b border-drawer-border pb-4.5">
            <DrawerTitle>Booking summary</DrawerTitle>
            <DrawerDescription>Review before requesting</DrawerDescription>
          </DrawerHeader>
          <DrawerBody className="space-y-5">
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
            <SummaryRow label="Schedule" value={scheduleSummary} />
            <SummaryRow label="Total" value={<CogitoMarks value={price} />} />
            <SummaryRow
              label="Available balance"
              value={
                walletQuery.isPending ? (
                  "Loading…"
                ) : (
                  <CogitoMarks value={availableBalance} />
                )
              }
              icon={<IconWallet />}
            />
            {!walletQuery.isPending && !hasEnoughMarks ? (
              <div className="rounded-lg border border-danger-border bg-danger/10 p-3">
                <Text className="flex flex-wrap items-center gap-1 text-sm text-danger">
                  <span>You need</span>
                  <CogitoMarks value={requiredHold - availableBalance} />
                  <span>more for the temporary hold.</span>
                </Text>
              </div>
            ) : null}
          </DrawerBody>
          <DrawerFooter>
            {walletQuery.isPending ? (
              <Button block size="lg" disabled progress>
                Checking balance…
              </Button>
            ) : hasEnoughMarks ? (
              <Button
                type="submit"
                form="create-booking-form"
                block
                size="lg"
                progress={createPending}
                disabled={submitDisabled}
              >
                {submitLabel}
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
          </DrawerFooter>
        </DrawerPopup>
      </Drawer>
    </Stack>
  );
}

function SummaryRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: ReactNode;
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
