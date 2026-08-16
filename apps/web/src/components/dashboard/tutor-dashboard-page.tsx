"use client";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  IconArrowRight,
  IconCalendarCheck,
  IconCalendarEvent,
  IconClock,
  IconCoins,
  IconInbox,
  IconSparkles,
  IconUserCheck,
} from "@tabler/icons-react";
import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardHeaderAction,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { IconBox } from "@cogito-app/ui/components/selia/icon-box";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import { Text } from "@cogito-app/ui/components/selia/text";

import {
  formatBookingDate,
  getBookingStateLabel,
  getBookingStateVariant,
} from "@/components/booking/booking-ui";
import { EmptyState } from "@/components/empty-state";
import { orpc } from "@/utils/orpc";

const TERMINAL_STATES = new Set([
  "completed",
  "cancelled",
  "late_cancelled",
  "declined",
  "no_show",
  "expired",
]);

export function TutorDashboardPage({ tutorName }: { tutorName: string }) {
  const bookings = useQuery(
    orpc.tutorActions.listBookings.queryOptions({ input: { limit: 20 } }),
  );
  const availability = useQuery(orpc.tutor.listAvailability.queryOptions());
  const profile = useQuery(orpc.tutor.getMyProfile.queryOptions());
  const payouts = useQuery(orpc.tutor.getMyPayouts.queryOptions({ input: {} }));

  const items = bookings.data?.items ?? [];
  const reviewQueue = items.filter(
    (booking) => booking.currentState === "awaiting_tutor_review",
  );
  const upcoming = items
    .filter(
      (booking) =>
        !TERMINAL_STATES.has(booking.currentState) &&
        new Date(booking.scheduledEndAt).getTime() >= Date.now(),
    )
    .toSorted(
      (a, b) =>
        new Date(a.scheduledStartAt).getTime() -
        new Date(b.scheduledStartAt).getTime(),
    );
  const nextBooking = upcoming[0];
  const firstName = tutorName.trim().split(/\s+/)[0] || "Tutor";
  const profileStatus = profile.data?.onboardingStatus ?? "draft";

  return (
    <Stack direction="column" spacing="lg">
      <Card className="overflow-hidden bg-primary/10">
        <CardBody className="grid gap-6 p-6 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <Badge variant="primary" pill>
              <IconSparkles className="size-3.5" /> Tutor workspace
            </Badge>
            <Heading className="mt-4 text-3xl">
              Welcome back, {firstName}
            </Heading>
            <Text className="mt-2 max-w-2xl text-muted">
              Start with student requests, then keep your next session and
              teaching availability on track.
            </Text>
          </div>
          <Button
            nativeButton={false}
            render={<Link to="/tutor-bookings" aria-label="Review bookings" />}
          >
            {reviewQueue.length > 0
              ? `Review ${reviewQueue.length} request${reviewQueue.length === 1 ? "" : "s"}`
              : "View bookings"}
            <IconArrowRight />
          </Button>
        </CardBody>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={<IconInbox />}
          label="Needs review"
          value={bookings.isPending ? "—" : String(reviewQueue.length)}
          tone={reviewQueue.length > 0 ? "warning-subtle" : "secondary-subtle"}
        />
        <MetricCard
          icon={<IconCalendarCheck />}
          label="Upcoming sessions"
          value={bookings.isPending ? "—" : String(upcoming.length)}
          tone="info-subtle"
        />
        <MetricCard
          icon={<IconClock />}
          label="Availability slots"
          value={
            availability.isPending
              ? "—"
              : String(availability.data?.length ?? 0)
          }
          tone="tertiary-subtle"
        />
        <MetricCard
          icon={<IconCoins />}
          label="Tutor payout"
          value={
            payouts.isPending ? "—" : `${payouts.data?.tutorPayout ?? 0} Marks`
          }
          tone="success-subtle"
        />
      </div>

      <Card>
        <CardHeader>
          <IconBox variant="success-subtle">
            <IconCoins />
          </IconBox>
          <div>
            <CardTitle>Payout details</CardTitle>
            <CardDescription>
              Completed sessions settle your share of the Marks; each Mark
              converts to Rp 7,000 at payout.
            </CardDescription>
          </div>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <Text className="text-sm text-muted">Completed sessions</Text>
              <Text className="mt-1 text-lg font-semibold">
                {payouts.data?.completedSessions ?? 0}
              </Text>
            </div>
            <div>
              <Text className="text-sm text-muted">Total session Marks</Text>
              <Text className="mt-1 text-lg font-semibold">
                {payouts.data?.totalMarks ?? 0}
              </Text>
            </div>
            <div>
              <Text className="text-sm text-muted">Cogito take</Text>
              <Text className="mt-1 text-lg font-semibold">
                {payouts.data?.cogitoTake ?? 0}
              </Text>
            </div>
            <div>
              <Text className="text-sm text-muted">Tutor payout</Text>
              <Text className="mt-1 text-lg font-semibold">
                {payouts.data?.tutorPayout ?? 0} Marks
              </Text>
              <Text className="mt-1 text-sm text-muted">
                ≈ Rp{" "}
                {((payouts.data?.tutorPayout ?? 0) * 7000).toLocaleString(
                  "id-ID",
                )}
              </Text>
            </div>
          </div>
        </CardBody>
      </Card>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
        <Card>
          <CardHeader>
            <IconBox variant="info-subtle">
              <IconCalendarEvent />
            </IconBox>
            <CardTitle>
              {reviewQueue.length > 0 ? "Requests to review" : "Next session"}
            </CardTitle>
            <CardDescription>
              {reviewQueue.length > 0
                ? "Student requests waiting for your decision."
                : "Your nearest active teaching commitment."}
            </CardDescription>
            <CardHeaderAction>
              <Button
                variant="plain"
                size="sm"
                nativeButton={false}
                render={
                  <Link
                    to="/tutor-bookings"
                    aria-label="View all tutor bookings"
                  />
                }
              >
                View all <IconArrowRight />
              </Button>
            </CardHeaderAction>
          </CardHeader>
          <CardBody>
            {bookings.isPending ? (
              <div className="h-28 animate-pulse rounded-lg bg-accent" />
            ) : reviewQueue.length > 0 ? (
              <Stack direction="column" spacing="sm" className="m-0!">
                {reviewQueue.slice(0, 3).map((booking) => (
                  <BookingAction
                    key={booking.id}
                    booking={booking}
                    actionLabel="Review request"
                  />
                ))}
              </Stack>
            ) : nextBooking ? (
              <BookingAction booking={nextBooking} actionLabel="View session" />
            ) : (
              <EmptyState
                icon={<IconCalendarEvent />}
                title="No sessions queued"
                description="New requests and upcoming lessons will appear here."
                tone="secondary"
                size="compact"
                className="rounded-lg"
              />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <IconBox variant="primary-subtle">
              <IconUserCheck />
            </IconBox>
            <CardTitle>Teaching setup</CardTitle>
            <CardDescription>
              Keep your profile and bookable hours ready.
            </CardDescription>
          </CardHeader>
          <CardBody className="flex flex-col gap-3">
            <div className="flex items-center justify-between rounded-lg bg-accent p-4">
              <Text className="font-medium">Profile status</Text>
              <Badge
                variant={profileStatus === "published" ? "success" : "warning"}
                pill
                className="capitalize"
              >
                {profileStatus.replaceAll("_", " ")}
              </Badge>
            </div>
            <Button
              variant="secondary"
              block
              nativeButton={false}
              render={
                <Link
                  to="/availability"
                  aria-label="Manage tutor availability"
                />
              }
            >
              Manage availability <IconArrowRight />
            </Button>
            {profileStatus !== "published" ? (
              <Button
                variant="outline"
                block
                nativeButton={false}
                render={
                  <Link to="/onboarding" aria-label="Complete tutor profile" />
                }
              >
                Complete tutor profile <IconArrowRight />
              </Button>
            ) : null}
          </CardBody>
        </Card>
      </div>
    </Stack>
  );
}

function MetricCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone:
    | "warning-subtle"
    | "secondary-subtle"
    | "info-subtle"
    | "tertiary-subtle"
    | "success-subtle";
}) {
  return (
    <Card>
      <CardBody className="flex items-center gap-4 p-5">
        <IconBox variant={tone}>{icon}</IconBox>
        <div>
          <Text className="text-sm text-muted">{label}</Text>
          <Heading size="sm">{value}</Heading>
        </div>
      </CardBody>
    </Card>
  );
}

function BookingAction({
  booking,
  actionLabel,
}: {
  booking: {
    id: string;
    currentState: string;
    scheduledStartAt: string | Date;
    timezone: string;
    proposer: { name: string } | null;
  };
  actionLabel: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-item-border bg-item p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Text className="font-semibold">
            {booking.proposer?.name ?? "Cogito student"}
          </Text>
          <Badge variant={getBookingStateVariant(booking.currentState)} pill>
            {getBookingStateLabel(booking.currentState)}
          </Badge>
        </div>
        <Text className="mt-1 text-sm text-muted">
          {formatBookingDate(booking.scheduledStartAt, booking.timezone)}
        </Text>
      </div>
      <Button
        size="sm"
        variant={
          booking.currentState === "awaiting_tutor_review"
            ? "primary"
            : "secondary"
        }
        nativeButton={false}
        render={
          <Link
            to="/bookings/$bookingId"
            params={{ bookingId: booking.id }}
            aria-label={`${actionLabel} for ${booking.proposer?.name ?? "Cogito student"}`}
          />
        }
      >
        {actionLabel} <IconArrowRight />
      </Button>
    </div>
  );
}
