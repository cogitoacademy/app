"use client";

import { useState } from "react";
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
import {
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

import { orpc } from "@/utils/orpc";

const BOOKING_TIMEZONE = "Asia/Jakarta";
const DEFAULT_SOLO_PRICE = 42;

type Modality = "online" | "offline";

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

export function CreateBookingPage({ tutorId }: { tutorId: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedModality, setSelectedModality] = useState<Modality>("online");
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);

  const profileQuery = useQuery(
    orpc.tutors.getProfile.queryOptions({ input: { tutorId } }),
  );
  const walletQuery = useQuery(orpc.wallet.get.queryOptions());

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
            queryKey: orpc.booking.listMine.queryKey({ input: {} }),
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
        toastManager.add({ title: error.message, type: "error" });
      },
    }),
  );

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
            {profileQuery.error instanceof Error
              ? profileQuery.error.message
              : "This tutor could not be loaded."}
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
  const selectedSlot =
    availableSlots.find((slot) => slot.id === selectedSlotId) ?? null;
  const price = Number(profile.prices?.["1"] ?? DEFAULT_SOLO_PRICE);
  const availableBalance = walletQuery.data?.availableBalance ?? 0;
  const hasEnoughMarks = availableBalance >= price;
  const tutorName = profile.displayName ?? profile.user?.name ?? "Cogito tutor";

  function submitBooking(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSlot) return;

    createBooking.mutate({
      tutorId: profile.userId,
      availabilitySlotId: selectedSlot.id,
      modality: effectiveModality,
      scheduledStartAt: new Date(selectedSlot.startDate),
      scheduledEndAt: new Date(selectedSlot.endDate),
      timezone: BOOKING_TIMEZONE,
    });
  }

  return (
    <Stack direction="column" spacing="lg">
      <div>
        <Button
          variant="plain"
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
              Solo session
            </Badge>
            <Heading size="md" className="mt-3">
              Book {tutorName}
            </Heading>
            <Text className="mt-1 text-muted">
              Choose an available slot and review the Marks hold before sending
              your request.
            </Text>
          </div>
          <Badge variant="secondary" pill>
            Asia/Jakarta
          </Badge>
        </div>
      </div>

      <form
        onSubmit={submitBooking}
        className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)] lg:items-start"
      >
        <div className="space-y-4">
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
                <FieldLabel>Modality</FieldLabel>
                <Select
                  value={effectiveModality}
                  onValueChange={(value) => {
                    setSelectedModality(value as Modality);
                    setSelectedSlotId(null);
                    createBooking.reset();
                  }}
                  disabled={modalityOptions.length === 1}
                >
                  <SelectTrigger>
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
                <div className="rounded-lg border border-item-border bg-item p-5 text-center">
                  <Heading size="sm">No matching slots yet</Heading>
                  <Text className="mt-2 text-muted">
                    This tutor has no future {effectiveModality} availability.
                    Try another modality or tutor.
                  </Text>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {availableSlots.map((slot) => {
                    const selected = slot.id === selectedSlotId;
                    return (
                      <Button
                        key={slot.id}
                        type="button"
                        variant={selected ? "primary" : "outline"}
                        aria-pressed={selected}
                        className="h-auto min-h-20 justify-start px-4 py-3 text-left"
                        onClick={() => {
                          setSelectedSlotId(slot.id);
                          createBooking.reset();
                        }}
                      >
                        <span className="flex min-w-0 flex-col items-start gap-1">
                          <span className="font-medium">
                            {formatSlotDate(slot.startDate)}
                          </span>
                          <span className="flex items-center gap-1.5 text-sm opacity-80">
                            <IconClock className="size-4" />
                            {formatSlotTime(slot.startDate, slot.endDate)}
                          </span>
                        </span>
                        {selected ? <IconCheck className="ml-auto" /> : null}
                      </Button>
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
                selectedSlot
                  ? `${formatSlotDate(selectedSlot.startDate)}, ${formatSlotTime(selectedSlot.startDate, selectedSlot.endDate)}`
                  : "Choose a time"
              }
            />
            <div className="rounded-lg border border-item-border bg-item p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Text className="text-sm text-muted">Session price</Text>
                  <Text className="text-xl font-semibold">{price} Marks</Text>
                </div>
                <IconBox variant="warning-subtle">
                  <IconCoins />
                </IconBox>
              </div>
              <Text className="mt-3 text-sm text-muted">
                Held now and only deducted according to the booking lifecycle.
              </Text>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-2 text-muted">
                <IconWallet className="size-4" /> Available
              </span>
              <Text className="font-medium">
                {walletQuery.isPending
                  ? "Loading..."
                  : `${availableBalance} Marks`}
              </Text>
            </div>
            {!walletQuery.isPending && !hasEnoughMarks ? (
              <div className="rounded-lg border border-danger-border bg-danger/10 p-3">
                <Text className="text-sm text-danger">
                  You need {price - availableBalance} more Marks to book this
                  session.
                </Text>
              </div>
            ) : null}
          </CardBody>
          <CardFooter className="flex-col">
            {walletQuery.isPending ? (
              <Button block size="lg" disabled progress>
                Checking balance
              </Button>
            ) : hasEnoughMarks ? (
              <Button
                type="submit"
                block
                size="lg"
                progress={createBooking.isPending}
                disabled={!selectedSlot || createBooking.isPending}
              >
                Send booking request
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
            {createBooking.isError ? (
              <div className="w-full rounded-lg border border-danger-border bg-danger/10 p-3">
                <Text className="text-center text-sm text-danger">
                  {createBooking.error.message}
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
