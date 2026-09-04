"use client";

import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Card,
  CardBody,
  CardHeader,
  CardHeaderAction,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { IconBox } from "@cogito-app/ui/components/selia/icon-box";
import { Separator } from "@cogito-app/ui/components/selia/separator";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import { Text } from "@cogito-app/ui/components/selia/text";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  IconArrowRight,
  IconBook2,
  IconCalendarEvent,
  IconLock,
  IconSchool,
} from "@tabler/icons-react";

import {
  isUpcomingBooking,
  NextLessonSection,
  type BookingCardData,
} from "@/components/booking/booking-card";
import { DashboardWelcomeCard } from "@/components/dashboard/dashboard-welcome-card";
import { EmptyState } from "@/components/empty-state";
import {
  TutorSummary,
  type TutorSummaryData,
} from "@/components/tutor/tutor-card";
import { orpc } from "@/utils/orpc";
import { useNow } from "@/hooks/use-now";

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

  const now = useNow();
  const bookingItems = (bookings.data?.items ?? []) as BookingCardData[];
  const nextBooking = bookingItems
    .filter((booking) => isUpcomingBooking(booking, now))
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
        <DashboardWelcomeCard
          name={studentName}
          viewerRole="student"
          hasUpcomingLesson={Boolean(nextBooking)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <KnowledgeBankCard eligible={knowledgeBankEligible} />
          <CompetitionCalendarCard />
        </div>
      </div>

      <div className="grid items-start gap-4 min-[1600px]:grid-cols-2">
        <NextLessonSection
          booking={nextBooking}
          isLoading={bookings.isPending}
          viewerRole="student"
        />
        <RecommendedTutorsCard
          tutors={recommendedTutors}
          isLoading={tutors.isPending}
        />
      </div>
    </Stack>
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
          className="mt-4 -ml-3 mb-0"
          nativeButton={false}
          render={
            eligible ? (
              <Link to="/knowledge-bank" aria-label="Open Knowledge Bank" />
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
    <Card className="[&_[data-slot=avatar]]:rounded-md [&_[data-slot=avatar-image]]:rounded-md [&_[data-slot=avatar-fallback]]:rounded-md">
      <CardHeader className="py-3">
        <CardTitle>Recommended tutors</CardTitle>
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
            {tutors.map((tutor, index) => (
              <Stack
                key={tutor.id}
                direction="column"
                spacing="sm"
                className="m-0!"
              >
                <RecommendedTutor tutor={tutor} />
                {index < tutors.length - 1 ? (
                  <Separator className="my-2!" />
                ) : null}
              </Stack>
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
  const tutorName = tutor.user?.name ?? "Cogito Tutor";

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
