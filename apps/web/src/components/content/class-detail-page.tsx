"use client";

import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import {
  IconArrowLeft,
  IconCalendarEvent,
  IconSchool,
  IconClock,
  IconUser,
} from "@tabler/icons-react";
import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Button } from "@cogito-app/ui/components/selia/button";
import { Card, CardBody } from "@cogito-app/ui/components/selia/card";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import { Text } from "@cogito-app/ui/components/selia/text";
import { EmptyStateCard } from "@/components/empty-state";
import { CogitoMarks } from "@/components/cogito-marks";
import { ClassEnrollmentPanel } from "@/components/content/class-enrollment-panel";
import Loader from "@/components/loader";
import { resolveProfileImageUrl } from "@/lib/profile-image-url";
import { orpc } from "@/utils/orpc";

function formatDate(date: Date | string) {
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(new Date(date));
}
function formatTime(date: Date | string) {
  return new Intl.DateTimeFormat("en", {
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(date));
}

export function ClassDetailPage() {
  const { classId } = useParams({ from: "/_app/classes_/$classId" });
  const academyClass = useQuery(
    orpc.classes.get.queryOptions({ input: { id: classId } }),
  );
  if (academyClass.isPending)
    return (
      <Stack direction="column" spacing="md" aria-busy="true">
        <Text className="text-muted" role="status">
          Loading class details…
        </Text>
        <Loader />
      </Stack>
    );
  if (
    academyClass.isError ||
    !["published", "postponed"].includes(academyClass.data.state)
  ) {
    return (
      <EmptyStateCard
        icon={<IconSchool />}
        title="Class unavailable"
        description="This class is no longer available. Browse the catalog for current classes."
        action={
          <Button
            nativeButton={false}
            render={<Link to="/classes" aria-label="Browse classes" />}
          >
            <IconArrowLeft /> Browse classes
          </Button>
        }
      />
    );
  }
  const item = academyClass.data;
  const coverUrl = resolveProfileImageUrl(
    item.coverKey?.startsWith("http")
      ? item.coverKey
      : item.coverKey
        ? `/uploads/${item.coverKey}`
        : undefined,
  );
  const enrollmentKind =
    item.kind === "cohort" || item.kind === "masterclass" ? item.kind : null;

  return (
    <Stack direction="column" spacing="lg" className="w-full min-w-0 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          nativeButton={false}
          variant="plain"
          render={<Link to="/classes" aria-label="Browse classes" />}
          className="w-fit"
        >
          <IconArrowLeft /> All classes
        </Button>
        <Button
          variant="plain"
          nativeButton={false}
          render={<Link to="/class-reports" aria-label="My class reports" />}
        >
          <IconCalendarEvent /> My class reports
        </Button>
      </div>
      <Card className="overflow-hidden">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt=""
            className="max-h-40 w-full object-cover sm:max-h-52"
          />
        ) : null}
        <CardBody className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">
              {item.kind === "cohort" ? "Cohort" : "Masterclass"}
            </Badge>
            <Text className="text-sm text-muted">
              {item.competition.parent
                ? `${item.competition.parent.name} · `
                : ""}
              {item.competition.name}
            </Text>
            {item.state === "postponed" ? (
              <Badge variant="warning">Postponed once</Badge>
            ) : null}
          </div>
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div className="min-w-0 space-y-3">
              <Heading
                level={1}
                size="md"
                className="break-words leading-tight"
              >
                {item.titleEn}
              </Heading>
              <Text className="flex items-center gap-2 text-sm text-muted">
                <IconCalendarEvent
                  className="size-4 shrink-0"
                  aria-hidden="true"
                />
                {item.sessions.length} session
                {item.sessions.length === 1 ? "" : "s"} · All times in WIB
              </Text>
            </div>
            <div className="shrink-0 space-y-1 border-t border-border pt-4 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-6">
              <Text className="text-xl font-semibold">
                <CogitoMarks
                  value={
                    item.kind === "cohort"
                      ? (item.cohortFullRateMarks ?? 0)
                      : (item.masterclassRateMarks ?? 0)
                  }
                />
              </Text>
              <Text className="text-xs text-muted">
                {item.kind === "cohort"
                  ? "per session · full cohort plan"
                  : "per student"}
              </Text>
            </div>
          </div>
          {item.state === "postponed" ? (
            <Text className="rounded-lg border border-warning-border bg-warning/10 p-3 text-sm">
              This cohort has a new schedule. Check your enrollment for the
              deadline to withdraw without a fee.
            </Text>
          ) : null}
        </CardBody>
      </Card>

      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,28rem)]">
        {enrollmentKind ? (
          <aside
            aria-label="Class enrollment"
            className="min-w-0 xl:col-start-2 xl:row-start-1"
          >
            <ClassEnrollmentPanel
              classId={item.id}
              kind={enrollmentKind}
              rates={{
                cohortFullRateMarks: item.cohortFullRateMarks,
                cohortHalfRateMarks: item.cohortHalfRateMarks,
                cohortSingleRateMarks: item.cohortSingleRateMarks,
                masterclassRateMarks: item.masterclassRateMarks,
              }}
              sessions={item.sessions.map((session) => ({
                id: session.id,
                sequenceNumber: session.sequenceNumber,
                titleEn: session.titleEn,
                startAt: session.startAt,
              }))}
            />
          </aside>
        ) : null}
        <div className="min-w-0 space-y-6 xl:col-start-1 xl:row-start-1">
          <section
            aria-labelledby="class-about-title"
            className="space-y-3 border-b border-border pb-6"
          >
            <Heading level={2} size="sm" id="class-about-title">
              About this class
            </Heading>
            <Text className="max-w-prose whitespace-pre-wrap leading-relaxed text-muted">
              {item.descriptionEn}
            </Text>
          </section>
          <section
            aria-labelledby="class-sessions-heading"
            className="space-y-4"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Heading level={2} size="sm" id="class-sessions-heading">
                {item.kind === "cohort"
                  ? "Curriculum and schedule"
                  : "Session details"}
              </Heading>
              <Text className="text-xs text-muted">WIB · UTC+7</Text>
            </div>
            {item.sessions.length === 0 ? (
              <EmptyStateCard
                icon={<IconCalendarEvent />}
                title="Schedule to be announced"
                description="Session details will appear here when the schedule is available."
              />
            ) : (
              <ol className="divide-y divide-border border-t border-border">
                {item.sessions.map((session) => (
                  <li
                    key={session.id}
                    className="grid min-w-0 grid-cols-[2.25rem_minmax(0,1fr)] gap-3 py-4 sm:grid-cols-[2.5rem_minmax(0,1fr)] sm:gap-4"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent font-semibold tabular-nums sm:size-10">
                      <span className="sr-only">Session </span>
                      {session.sequenceNumber}
                    </span>
                    <div className="min-w-0 space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <Heading
                          level={3}
                          size="sm"
                          className="break-words leading-snug"
                        >
                          {session.titleEn}
                        </Heading>
                        <Badge variant="secondary-outline">
                          {session.mode === "online" ? "Online" : "In person"}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                        <Text className="flex items-center gap-2">
                          <IconCalendarEvent
                            className="size-4 shrink-0"
                            aria-hidden="true"
                          />
                          {formatDate(session.startAt)}
                        </Text>
                        <Text className="flex items-center gap-2">
                          <IconClock
                            className="size-4 shrink-0"
                            aria-hidden="true"
                          />
                          {formatTime(session.startAt)} WIB
                        </Text>
                      </div>
                      {session.curriculumEn ? (
                        <Text className="whitespace-pre-wrap text-sm leading-relaxed">
                          {session.curriculumEn}
                        </Text>
                      ) : null}
                      <Text className="flex items-start gap-2 text-sm text-muted">
                        <IconUser
                          className="mt-0.5 size-4 shrink-0"
                          aria-hidden="true"
                        />
                        <span>
                          {session.tutor?.name ?? "Tutor to be announced"}
                        </span>
                      </Text>
                      {session.mode === "online" ? (
                        <Text className="text-xs text-muted">
                          Meeting details are available to enrolled students.
                        </Text>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </Stack>
  );
}
