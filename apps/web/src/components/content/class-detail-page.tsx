"use client";

import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import {
  IconArrowLeft,
  IconCalendarEvent,
  IconSchool,
} from "@tabler/icons-react";
import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Accordion,
  AccordionItem,
  AccordionHeader,
  AccordionTrigger,
  AccordionPanel,
} from "@cogito-app/ui/components/selia/accordion";
import { useState } from "react";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import { Text } from "@cogito-app/ui/components/selia/text";
import { EmptyStateCard } from "@/components/empty-state";
import { CogitoMarks } from "@/components/cogito-marks";
import { ClassEnrollmentPanel } from "@/components/content/class-enrollment-panel";
import Loader from "@/components/loader";
import {
  competitionPaletteClassName,
  getCompetitionPalette,
  getCompetitionPaletteStyle,
} from "@/lib/competition-colors";
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
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
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
  const palette = getCompetitionPalette(
    item.competition.parent ?? item.competition,
  );
  const orderedSessions = item.sessions.toSorted(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
  );
  const rates = (
    item.kind === "cohort"
      ? [
          item.cohortFullRateMarks,
          item.cohortHalfRateMarks,
          item.cohortSingleRateMarks,
        ]
      : [item.masterclassRateMarks]
  ).filter((rate): rate is number => rate !== null && rate > 0);
  const startingRate = rates.length ? Math.min(...rates) : null;
  const canCollapseDescription =
    item.descriptionEn.length > 180 ||
    item.descriptionEn.split("\n").length > 3;
  const enrollmentKind =
    item.kind === "cohort" || item.kind === "masterclass" ? item.kind : null;

  return (
    <Stack direction="column" spacing="lg" className="w-full min-w-0 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          nativeButton={false}
          variant="underline"
          render={<Link to="/classes" aria-label="Browse classes" />}
          className="w-fit"
        >
          <IconArrowLeft /> All classes
        </Button>
        <Button
          variant="tertiary"
          nativeButton={false}
          size="sm"
          render={<Link to="/class-reports" aria-label="My class reports" />}
        >
          <IconCalendarEvent /> My class reports
        </Button>
      </div>
      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,28rem)] xl:grid-rows-[auto_1fr]">
        <section
          aria-labelledby="class-title"
          className="min-w-0 space-y-5 wrap-anywhere xl:col-start-1 xl:row-start-1"
        >
          <div className="min-w-0 max-w-full">
            <Heading
              id="class-title"
              level={1}
              size="md"
              className="break-words"
            >
              {item.titleEn}
            </Heading>
            <Text
              id="class-description"
              className={`max-w-full text-muted whitespace-pre-wrap ${canCollapseDescription && !descriptionExpanded ? "line-clamp-3" : ""}`}
            >
              {item.descriptionEn}
            </Text>
            {canCollapseDescription ? (
              <Button
                variant="underline"
                size="sm"
                aria-expanded={descriptionExpanded}
                aria-controls="class-description"
                onClick={() => setDescriptionExpanded(!descriptionExpanded)}
              >
                {descriptionExpanded ? "See less" : "See more"}
              </Button>
            ) : null}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge variant="tertiary">
              {item.kind === "cohort" ? "Cohort" : "Masterclass"}
            </Badge>
            <Badge
              variant="secondary"
              className={palette ? competitionPaletteClassName : undefined}
              style={getCompetitionPaletteStyle(palette)}
            >
              {item.competition.parent
                ? `${item.competition.parent.name} · `
                : ""}
              {item.competition.name}
            </Badge>
            <Text className="text-sm text-muted">
              {item.sessions.length} session
              {item.sessions.length === 1 ? "" : "s"}
            </Text>
            {item.state === "postponed" ? (
              <Badge variant="warning">Postponed once</Badge>
            ) : null}
          </div>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-2 border-y border-border py-4 text-sm">
            <dt className="text-muted">
              {item.kind === "cohort" ? "Course dates" : "Date & time"}
            </dt>
            <dd>
              {orderedSessions.length
                ? item.kind === "cohort"
                  ? `${formatDate(orderedSessions[0]!.startAt)} – ${formatDate(orderedSessions[orderedSessions.length - 1]!.startAt)}`
                  : `${formatDate(orderedSessions[0]!.startAt)} · ${formatTime(orderedSessions[0]!.startAt)} WIB`
                : "To be announced"}
            </dd>
            {item.kind === "masterclass" ? (
              <>
                <dt className="text-muted">Tutor</dt>
                <dd>
                  {orderedSessions[0]?.tutor?.name ?? "Tutor to be announced"}
                </dd>
                <dt className="text-muted">Mode</dt>
                <dd>
                  {orderedSessions[0]
                    ? orderedSessions[0].mode === "online"
                      ? "Online"
                      : "In person"
                    : "To be announced"}
                </dd>
              </>
            ) : (
              <>
                <dt className="text-muted">Enrollment</dt>
                <dd>
                  Before your selected session starts, subject to availability.
                </dd>
              </>
            )}
            <dt className="text-muted">Price</dt>
            <dd className="flex flex-wrap items-center gap-1">
              {startingRate !== null ? (
                <>
                  Start from <CogitoMarks value={startingRate} />
                  {item.kind === "cohort" ? (
                    <span className="text-muted">per session</span>
                  ) : (
                    <span className="text-muted">per student</span>
                  )}
                </>
              ) : (
                "Price unavailable"
              )}
            </dd>
          </dl>
          {item.state === "postponed" ? (
            <Text className="rounded border border-warning-border bg-warning/10 p-3 text-sm">
              This class has a new schedule. Check your enrollment for the
              deadline to withdraw without a fee.
            </Text>
          ) : null}
        </section>
        {enrollmentKind ? (
          <aside
            aria-label="Class enrollment"
            className="min-w-0 xl:col-start-2 xl:row-start-1 xl:row-span-2"
          >
            <ClassEnrollmentPanel
              classId={item.id}
              kind={enrollmentKind}
              competitionName={
                item.competition.parent
                  ? `${item.competition.parent.name} · ${item.competition.name}`
                  : item.competition.name
              }
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
                mode: session.mode,
                tutor: session.tutor,
              }))}
            />
          </aside>
        ) : null}
        <div className="min-w-0 xl:col-start-1 xl:row-start-2">
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
              <Accordion multiple className="gap-3">
                {orderedSessions.map((session) => (
                  <AccordionItem
                    key={session.id}
                    value={session.id}
                    className="rounded-lg border border-card-border bg-card px-3 last:border-b"
                  >
                    <AccordionHeader render={<h3 />}>
                      <AccordionTrigger className="py-2">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded bg-accent tabular-nums">
                          <span className="sr-only">Session </span>
                          {session.sequenceNumber}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="wrap-anywhere font-semibold">
                            {session.titleEn}
                          </span>
                          <span className="text-sm font-normal text-muted">
                            {formatDate(session.startAt)} ·{" "}
                            {formatTime(session.startAt)} WIB
                          </span>
                        </span>
                      </AccordionTrigger>
                    </AccordionHeader>
                    <AccordionPanel>
                      <div className="space-y-3 wrap-anywhere pb-3 sm:pl-12">
                        <div className="flex flex-wrap items-center gap-3">
                          <Text className="text-sm text-muted">
                            {session.mode === "online" ? "Online" : "In person"}{" "}
                            | Tutor:{" "}
                            {session.tutor?.name ?? "Tutor to be announced"}
                          </Text>
                        </div>
                        <Text className="whitespace-pre-wrap text-sm leading-relaxed">
                          {session.curriculumEn ||
                            "Curriculum to be announced."}
                        </Text>
                        {session.mode === "online" ? (
                          <Text className="text-xs text-muted">
                            Meeting details are available to enrolled students.
                          </Text>
                        ) : null}
                      </div>
                    </AccordionPanel>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </section>
        </div>
      </div>
    </Stack>
  );
}
