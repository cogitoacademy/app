"use client";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  IconArrowLeft,
  IconArrowUpRight,
  IconCalendarEvent,
  IconDeviceLaptop,
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
import { useState, type ReactNode } from "react";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import { Text } from "@cogito-app/ui/components/selia/text";
import { EmptyStateCard } from "@/components/empty-state";
import { CogitoMarks } from "@/components/cogito-marks";
import { ClassEnrollmentPanel } from "@/components/content/class-enrollment-panel";
import Loader from "@/components/loader";
import { useNow } from "@/hooks/use-now";
import {
  competitionPaletteClassName,
  getCompetitionPalette,
  getCompetitionPaletteStyle,
} from "@/lib/competition-colors";
import {
  getClassSessionScheduleStatus,
  sortClassSessions,
} from "@/lib/class-session-presentation";
import { client, orpc } from "@/utils/orpc";

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

export function ClassDetailPage({ classId }: { classId: string }) {
  const academyClass = useQuery(
    orpc.classes.get.queryOptions({ input: { id: classId } }),
  );
  const sessionAccess = useQuery(
    orpc.classes.listSessionReports.queryOptions({
      input: { classId, includeUnreported: true },
    }),
  );

  const sessionDetails = new Map<string, ReactNode>();
  for (const session of sessionAccess.data ?? []) {
    sessionDetails.set(
      session.sessionId,
      <SessionJoinDetails
        mode={session.mode}
        state={session.state}
        meetingUrl={session.meeting?.meetingUrl ?? null}
        meetingStatus={session.meeting?.status ?? null}
        roomName={session.room?.name ?? null}
        roomLocation={session.room?.location ?? null}
      />,
    );
  }

  if (academyClass.isPending)
    return (
      <Stack direction="column" spacing="md" aria-busy="true">
        <Loader />
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
  return (
    <ClassDetailView item={academyClass.data} sessionDetails={sessionDetails} />
  );
}

function SessionJoinDetails({
  mode,
  state,
  meetingUrl,
  meetingStatus,
  roomName,
  roomLocation,
}: {
  mode: "online" | "in_person";
  state: "scheduled" | "completed" | "cancelled";
  meetingUrl: string | null;
  meetingStatus: string | null;
  roomName: string | null;
  roomLocation: string | null;
}) {
  if (state === "cancelled") {
    return <Text className="text-sm text-muted">Session cancelled.</Text>;
  }
  if (state === "completed") {
    return <Text className="text-sm text-muted">Session completed.</Text>;
  }
  if (mode === "in_person") {
    return roomName ? (
      <>
        <Text className="font-medium">{roomName}</Text>
        {roomLocation ? (
          <Text className="text-sm text-muted">{roomLocation}</Text>
        ) : null}
      </>
    ) : (
      <Text className="text-sm text-muted">Room to be announced.</Text>
    );
  }
  if (meetingUrl) {
    return (
      <Button
        variant="tertiary"
        size="xs"
        nativeButton={false}
        render={
          <a
            href={meetingUrl}
            target="_blank"
            rel="noreferrer"
            aria-label="Join class meeting"
          />
        }
      >
        <IconDeviceLaptop aria-hidden="true" />
        Join meeting
        <IconArrowUpRight aria-hidden="true" />
      </Button>
    );
  }
  if (meetingStatus === "failed") {
    return (
      <Text className="text-sm text-warning">
        Meeting link unavailable. Cogito is retrying.
      </Text>
    );
  }
  return (
    <Text className="text-sm text-muted">Meeting link is being prepared.</Text>
  );
}

type ClassDetailRecord = Awaited<ReturnType<typeof client.classes.get>>;

export function ClassDetailView({
  item,
  adminTutorFeeIdr,
  adminSummary,
  adminControls,
  sessionDetails,
  sessionActions,
  badgeActions,
}: {
  item: ClassDetailRecord;
  adminTutorFeeIdr?: number;
  adminSummary?: ReactNode;
  adminControls?: ReactNode;
  sessionActions?: ReadonlyMap<string, ReactNode>;
  badgeActions?: ReactNode;
  sessionDetails?: ReadonlyMap<string, ReactNode>;
}) {
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const now = useNow();
  const isAdmin = Boolean(adminControls);
  const palette = getCompetitionPalette(
    item.competition.parent ?? item.competition,
  );
  const orderedSessions = sortClassSessions(item.sessions, now);
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
          role="link"
          render={
            <Link
              to={isAdmin ? "/admin-classes" : "/classes"}
              aria-label="Browse classes"
            />
          }
          className="w-fit"
        >
          <IconArrowLeft /> All classes
        </Button>
        {!isAdmin ? (
          <Button
            variant="tertiary"
            nativeButton={false}
            size="sm"
            render={<Link to="/class-reports" aria-label="My class reports" />}
          >
            <IconCalendarEvent /> My class reports
          </Button>
        ) : (
          <Badge variant="info">Admin view</Badge>
        )}
      </div>
      <div
        className={`grid min-w-0 items-start gap-6 ${
          isAdmin
            ? ""
            : "xl:grid-cols-[minmax(0,1fr)_minmax(22rem,28rem)] xl:grid-rows-[auto_1fr]"
        }`}
      >
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
            {badgeActions ? (
              <div className="ml-auto">{badgeActions}</div>
            ) : null}
          </div>
          <dl className="flex flex-col gap-3 border-y border-border py-4 text-sm">
            {isAdmin ? (
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <dt className="text-muted">Status</dt>
                <dd>
                  <Badge
                    variant={
                      item.state === "published" ? "success" : "secondary"
                    }
                  >
                    {item.state}
                  </Badge>
                </dd>
              </div>
            ) : null}
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <dt className="text-muted">
                {item.kind === "cohort" ? "Course dates" : "Date & time"}
              </dt>
              <dd className="text-right">
                {orderedSessions.length
                  ? item.kind === "cohort"
                    ? `${formatDate(orderedSessions[0]!.startAt)} – ${formatDate(orderedSessions[orderedSessions.length - 1]!.startAt)}`
                    : `${formatDate(orderedSessions[0]!.startAt)} · ${formatTime(orderedSessions[0]!.startAt)} WIB`
                  : "To be announced"}
              </dd>
            </div>
            {item.kind === "masterclass" ? (
              <>
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <dt className="text-muted">Tutor</dt>
                  <dd className="text-right">
                    {orderedSessions[0]?.tutor?.name ?? "Tutor to be announced"}
                  </dd>
                </div>
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <dt className="text-muted">Mode</dt>
                  <dd className="text-right">
                    {orderedSessions[0]
                      ? orderedSessions[0].mode === "online"
                        ? "Online"
                        : "In person"
                      : "To be announced"}
                  </dd>
                </div>
              </>
            ) : (
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <dt className="text-muted">Enrollment</dt>
                <dd className="text-right">
                  Before your selected session starts, subject to availability.
                </dd>
              </div>
            )}
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <dt className="text-muted">Price</dt>
              <dd className="flex flex-wrap items-center justify-end gap-1 text-right">
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
            </div>
            {isAdmin && adminTutorFeeIdr !== undefined ? (
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <dt className="text-muted">Tutor fee per session</dt>
                <dd className="text-right">
                  {new Intl.NumberFormat("id-ID", {
                    style: "currency",
                    currency: "IDR",
                    maximumFractionDigits: 0,
                  }).format(adminTutorFeeIdr)}
                </dd>
              </div>
            ) : null}
            {isAdmin ? (
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <dt className="text-muted">Sessions</dt>
                <dd className="text-right">{item.sessions.length}</dd>
              </div>
            ) : null}
          </dl>
          {item.state === "postponed" ? (
            <Text className="rounded border border-warning-border bg-warning/10 p-3 text-sm">
              {isAdmin
                ? "This class has a new schedule. Enrolled students may have a fee-free withdrawal window."
                : "This class has a new schedule. Check your enrollment for the deadline to withdraw without a fee."}
            </Text>
          ) : null}
        </section>
        {isAdmin && adminSummary ? (
          <aside
            aria-label="Class administration"
            className="min-w-0 xl:col-start-2 xl:row-start-1 xl:row-span-2"
          >
            {adminSummary}
          </aside>
        ) : null}
        {!isAdmin && enrollmentKind ? (
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
                {orderedSessions.map((session) => {
                  const status = getClassSessionScheduleStatus(session, now);
                  return (
                    <AccordionItem
                      key={session.id}
                      value={session.id}
                      className="rounded-lg border border-card-border bg-card px-2 last:border-b"
                    >
                      <AccordionHeader render={<h3 />}>
                        <AccordionTrigger className="py-2">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded bg-accent tabular-nums">
                            <span className="sr-only">Session </span>
                            {session.sequenceNumber}
                          </span>
                          <span className="flex min-w-0 flex-1 flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-3">
                            <span className="wrap-anywhere min-w-0 flex-1 font-semibold">
                              {session.titleEn}
                            </span>
                            <Badge
                              variant={status.variant}
                              size="sm"
                              className="shrink-0"
                            >
                              {status.label}
                            </Badge>
                          </span>
                        </AccordionTrigger>
                      </AccordionHeader>
                      <AccordionPanel>
                        <div className="space-y-3 wrap-anywhere sm:pl-12">
                          {!isAdmin ? (
                            <Text className="text-sm text-muted">
                              Tutor:{" "}
                              {session.tutor?.name ?? "Tutor to be announced"}
                            </Text>
                          ) : null}
                          <Text className="whitespace-pre-wrap text-sm leading-relaxed">
                            {session.curriculumEn ||
                              "Curriculum to be announced."}
                          </Text>
                          {sessionDetails?.get(session.id)}
                          {sessionActions?.get(session.id)}
                          {!isAdmin &&
                          session.mode === "online" &&
                          !sessionDetails?.has(session.id) ? (
                            <Text className="text-xs text-muted">
                              Enroll to see meeting details.
                            </Text>
                          ) : null}
                        </div>
                      </AccordionPanel>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            )}
          </section>
        </div>
      </div>
      {adminControls}
    </Stack>
  );
}
