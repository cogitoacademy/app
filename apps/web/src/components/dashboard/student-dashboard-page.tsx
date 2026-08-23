"use client";

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
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  IconArrowRight,
  IconBook2,
  IconCalendarEvent,
  IconClock,
  IconLock,
  IconMapPin,
  IconSchool,
  IconSparkles,
  IconVideo,
} from "@tabler/icons-react";

import {
  formatBookingDate,
  getBookingStateLabel,
  getBookingStateVariant,
  getBookingTypeLabel,
} from "@/components/booking/booking-ui";
import { EmptyState, EmptyStateCard } from "@/components/empty-state";
import {
  TutorSummary,
  type TutorSummaryData,
} from "@/components/tutor/tutor-card";
import { orpc } from "@/utils/orpc";

const TERMINAL_BOOKING_STATES = new Set([
  "completed",
  "cancelled",
  "late_cancelled",
  "declined",
  "no_show",
  "expired",
]);

type DashboardBooking = {
  id: string;
  type: string;
  currentState: string;
  scheduledStartAt: string | Date;
  scheduledEndAt: string | Date;
  timezone: string;
  modality: string;
  originalMarks: number;
  tutor: { name: string } | null;
};

export function StudentDashboardPage({ studentName }: { studentName: string }) {
  const bookings = useQuery(
    orpc.booking.listMine.queryOptions({ input: { limit: 20 } }),
  );
  const tutors = useQuery(
    orpc.tutors.listPublished.queryOptions({
      input: { limit: 3, offset: 0 },
    }),
  );
  const wallet = useQuery(orpc.wallet.get.queryOptions());

  const now = Date.now();
  const nextBooking = (bookings.data?.items ?? [])
    .filter(
      (booking) =>
        !TERMINAL_BOOKING_STATES.has(booking.currentState) &&
        new Date(booking.scheduledEndAt).getTime() >= now,
    )
    .toSorted(
      (a, b) =>
        new Date(a.scheduledStartAt).getTime() -
        new Date(b.scheduledStartAt).getTime(),
    )[0];
  const recommendedTutors = (tutors.data ?? []) as TutorSummaryData[];
  const knowledgeBankEligible = (wallet.data?.availableBalance ?? 0) >= 35;

  return (
    <Stack direction="column" spacing="lg">
      <div className="grid gap-4 lg:grid-cols-2">
        <WelcomeCard
          studentName={studentName}
          hasUpcomingLesson={Boolean(nextBooking)}
        />
        <NextLessonCard booking={nextBooking} isLoading={bookings.isPending} />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(16rem,0.72fr)_minmax(0,1.6fr)]">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <KnowledgeBankCard eligible={knowledgeBankEligible} />
          <CompetitionCalendarCard />
        </div>
        <RecommendedTutorsCard
          tutors={recommendedTutors}
          isLoading={tutors.isPending}
        />
      </div>
    </Stack>
  );
}

function WelcomeCard({
  studentName,
  hasUpcomingLesson,
}: {
  studentName: string;
  hasUpcomingLesson: boolean;
}) {
  const firstName = studentName.trim().split(/\s+/)[0] || "Student";

  return (
    <Card className="relative min-h-64 overflow-hidden bg-primary/10">
      <LearningOrbitIllustration />
      <CardBody className="relative z-1 flex h-full flex-col items-start justify-between gap-8 p-6">
        <div>
          <Badge variant="primary" pill>
            <IconSparkles className="size-3.5" /> Student space
          </Badge>
          <Heading className="mt-5 max-w-sm text-3xl">
            Hi, {firstName}! <span aria-hidden="true">👋</span>
          </Heading>
          <Text className="mt-2 max-w-sm text-muted">
            {hasUpcomingLesson
              ? "Your next learning session is on the calendar. Keep the momentum going."
              : "Ready to turn your next learning goal into a session?"}
          </Text>
        </div>
        <Button
          nativeButton={false}
          render={<Link to="/tutors" aria-label="Find a tutor" />}
        >
          Find a tutor <IconArrowRight />
        </Button>
      </CardBody>
    </Card>
  );
}

function LearningOrbitIllustration() {
  return (
    <svg
      viewBox="0 0 320 240"
      aria-hidden="true"
      className="pointer-events-none absolute -bottom-8 -right-8 h-64 w-80 text-primary opacity-80"
    >
      <path
        d="M75 160c34-58 105-92 177-66"
        className="fill-none stroke-current opacity-25"
        strokeWidth="2"
        strokeDasharray="7 8"
      />
      <path
        d="M93 192c41-34 94-50 151-36"
        className="fill-none stroke-current opacity-20"
        strokeWidth="2"
      />
      <circle cx="250" cy="94" r="38" className="fill-current opacity-10" />
      <circle cx="250" cy="94" r="11" className="fill-current opacity-70" />
      <circle cx="86" cy="162" r="9" className="fill-current opacity-50" />
      <circle cx="220" cy="164" r="7" className="fill-current opacity-40" />
      <g className="fill-background stroke-current" strokeWidth="2">
        <path d="M128 100l35-15 35 15-35 15-35-15Z" />
        <path d="M139 108v19c16 10 33 10 49 0v-19" />
        <path d="M198 101v22" />
      </g>
      <path
        d="M145 170h64v14h-64zM152 157h64v13h-64z"
        className="fill-background stroke-current"
        strokeWidth="2"
      />
    </svg>
  );
}

function NextLessonCard({
  booking,
  isLoading,
}: {
  booking: DashboardBooking | undefined;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <Card className="min-h-64 animate-pulse">
        <CardBody className="flex h-full flex-col gap-4 p-6">
          <div className="h-4 w-28 rounded bg-accent" />
          <div className="h-8 w-48 rounded bg-accent" />
          <div className="mt-auto h-20 rounded-lg bg-accent" />
        </CardBody>
      </Card>
    );
  }

  if (!booking) {
    return (
      <EmptyStateCard
        className="min-h-64"
        icon={<IconCalendarEvent />}
        title="No lesson scheduled yet"
        description="Choose a verified tutor and your next session will appear here."
        action={
          <Button
            variant="secondary"
            nativeButton={false}
            render={<Link to="/tutors" aria-label="Browse tutors" />}
          >
            Browse tutors
          </Button>
        }
      />
    );
  }

  return (
    <Card className="min-h-64 overflow-hidden">
      <CardHeader>
        <IconBox variant="info-subtle">
          <IconCalendarEvent />
        </IconBox>
        <CardTitle>Next lesson</CardTitle>
        <CardDescription>
          {getBookingTypeLabel(booking.type)} with{" "}
          {booking.tutor?.name ?? "your tutor"}
        </CardDescription>
        <Badge variant={getBookingStateVariant(booking.currentState)} pill>
          {getBookingStateLabel(booking.currentState)}
        </Badge>
      </CardHeader>
      <CardBody className="flex h-full flex-col gap-5 p-6">
        <div className="rounded-lg bg-accent p-4">
          <Text className="font-semibold">
            {formatBookingDate(booking.scheduledStartAt, booking.timezone)}
          </Text>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted">
            <span className="inline-flex items-center gap-1.5">
              {booking.modality === "online" ? (
                <IconVideo className="size-4" />
              ) : (
                <IconMapPin className="size-4" />
              )}
              {booking.modality === "online"
                ? "Online session"
                : "Offline session"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <IconClock className="size-4" /> {booking.originalMarks} Marks
            </span>
          </div>
        </div>
        <Button
          variant="secondary"
          className="mt-auto self-end"
          nativeButton={false}
          render={
            <Link
              to="/bookings/$bookingId"
              params={{ bookingId: booking.id }}
              aria-label="View next lesson details"
            />
          }
        >
          View booking <IconArrowRight />
        </Button>
      </CardBody>
    </Card>
  );
}

function KnowledgeBankCard({ eligible }: { eligible: boolean }) {
  return (
    <Card className="overflow-hidden">
      <CardBody className="relative p-5">
        <ResourceDecoration />
        <IconBox
          variant={eligible ? "success-subtle" : "warning-subtle"}
          className="mb-4"
        >
          {eligible ? <IconBook2 /> : <IconLock />}
        </IconBox>
        <Heading size="sm">Knowledge Bank</Heading>
        <Text className="mt-1 text-sm text-muted">
          {eligible
            ? "Explore learning materials curated by Cogito."
            : "Keep 35 available Marks to unlock learning materials."}
        </Text>
        <Button
          variant="plain"
          size="sm"
          className="mt-4 -ml-3"
          nativeButton={false}
          render={
            eligible ? (
              <Link to="/student-resources" aria-label="Open Knowledge Bank" />
            ) : (
              <Link to="/balance" aria-label="View Marks balance" />
            )
          }
        >
          {eligible ? "Open Knowledge Bank" : "View balance"} <IconArrowRight />
        </Button>
      </CardBody>
    </Card>
  );
}

function ResourceDecoration() {
  return (
    <svg
      viewBox="0 0 120 120"
      aria-hidden="true"
      className="pointer-events-none absolute -right-5 -top-5 size-32 text-primary opacity-15"
    >
      <circle cx="60" cy="60" r="48" className="fill-current" />
      <path
        d="M27 69c18-27 43-38 70-28M35 86c20-18 40-24 64-17"
        className="fill-none stroke-background"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <circle cx="83" cy="38" r="8" className="fill-background" />
    </svg>
  );
}

function CompetitionCalendarCard() {
  return (
    <Card>
      <CardBody className="p-5">
        <IconBox variant="tertiary-subtle" className="mb-4">
          <IconCalendarEvent />
        </IconBox>
        <Heading size="sm">Competition Calendar</Heading>
        <Text className="mt-1 text-sm text-muted">
          Find upcoming academic competitions and important dates.
        </Text>
        <Button
          variant="plain"
          size="sm"
          className="mt-4 -ml-3"
          nativeButton={false}
          render={
            <Link to="/calendar" aria-label="Open competition calendar" />
          }
        >
          Explore calendar <IconArrowRight />
        </Button>
      </CardBody>
    </Card>
  );
}

function RecommendedTutorsCard({
  tutors,
  isLoading,
}: {
  tutors: TutorSummaryData[];
  isLoading: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <IconBox variant="primary-subtle">
          <IconSchool />
        </IconBox>
        <CardTitle>Recommended tutors</CardTitle>
        <CardDescription>
          Recently published tutors ready for your next learning goal.
        </CardDescription>
        <CardHeaderAction>
          <Button
            variant="plain"
            size="sm"
            nativeButton={false}
            render={<Link to="/tutors" aria-label="View all tutors" />}
          >
            View all <IconArrowRight />
          </Button>
        </CardHeaderAction>
      </CardHeader>
      <CardBody>
        {isLoading ? (
          <Stack direction="column" spacing="sm" className="m-0!">
            {["tutor-one", "tutor-two", "tutor-three"].map((key) => (
              <div
                key={key}
                className="h-24 animate-pulse rounded-lg bg-accent"
              />
            ))}
          </Stack>
        ) : tutors.length ? (
          <Stack direction="column" spacing="sm" className="m-0!">
            {tutors.map((tutor) => (
              <RecommendedTutor key={tutor.id} tutor={tutor} />
            ))}
          </Stack>
        ) : (
          <EmptyState
            icon={<IconSchool />}
            title="No recommendations yet"
            description="Published tutors will appear here."
            tone="secondary"
            size="compact"
            className="rounded-lg"
          />
        )}
      </CardBody>
    </Card>
  );
}

function RecommendedTutor({ tutor }: { tutor: TutorSummaryData }) {
  const tutorName = tutor.displayName ?? tutor.user?.name ?? "Cogito Tutor";

  return (
    <TutorSummary
      tutor={tutor}
      action={
        <Button
          size="sm"
          variant="secondary"
          nativeButton={false}
          render={
            <Link
              to="/tutors/$tutorId/book"
              params={{ tutorId: tutor.id }}
              aria-label={`Book a session with ${tutorName}`}
            />
          }
        >
          Book session
        </Button>
      }
    />
  );
}
