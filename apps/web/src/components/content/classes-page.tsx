"use client";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { IconCalendarEvent, IconSchool } from "@tabler/icons-react";
import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import { Text } from "@cogito-app/ui/components/selia/text";
import { EmptyStateCard } from "@/components/empty-state";
import { CogitoMarks } from "@/components/cogito-marks";
import Loader from "@/components/loader";
import { resolveProfileImageUrl } from "@/lib/profile-image-url";
import { orpc } from "@/utils/orpc";

function formatSessionDate(date: Date | string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(date));
}

export function ClassesPage() {
  const classes = useQuery(orpc.classes.list.queryOptions());

  if (classes.isPending) return <Loader />;
  if (classes.isError) {
    return (
      <EmptyStateCard
        icon={<IconSchool />}
        title="Classes unavailable"
        description="We could not load the class catalog. Please try again later."
        action={
          <Button onClick={() => void classes.refetch()}>Try again</Button>
        }
      />
    );
  }

  const publishedClasses = classes.data.filter(
    (academyClass) => academyClass.sessions.length > 0,
  );
  const cohorts = publishedClasses.filter(
    (academyClass) => academyClass.kind === "cohort",
  );
  const now = Date.now();
  const upcoming = publishedClasses
    .flatMap((academyClass) =>
      academyClass.sessions
        .filter((session) => new Date(session.startAt).getTime() > now)
        .filter(
          (session) =>
            academyClass.kind === "masterclass" || session.sequenceNumber === 1,
        )
        .map((session) => ({ academyClass, session })),
    )
    .toSorted(
      (left, right) =>
        new Date(left.session.startAt).getTime() -
        new Date(right.session.startAt).getTime(),
    );

  return (
    <Stack direction="column" spacing="lg" className="w-full min-w-0 pb-8">
      <div>
        <Heading level={1}>Classes</Heading>
        <Text className="mt-1 text-muted">
          Explore cohorts, masterclasses, and upcoming learning sessions.
        </Text>
      </div>

      <section aria-labelledby="cohort-classes-heading">
        <div className="mb-4 flex items-center gap-2">
          <IconSchool className="size-5 text-primary" aria-hidden="true" />
          <Heading level={2} id="cohort-classes-heading">
            Cohorts
          </Heading>
        </div>
        {cohorts.length === 0 ? (
          <EmptyStateCard
            size="compact"
            tone="secondary"
            icon={<IconSchool />}
            title="No cohorts published yet"
            description="Published cohort classes will appear here."
          />
        ) : (
          <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {cohorts.map((academyClass) => {
              const firstSession = academyClass.sessions[0];
              if (!firstSession) return null;
              const coverUrl = resolveProfileImageUrl(
                academyClass.coverKey?.startsWith("http")
                  ? academyClass.coverKey
                  : academyClass.coverKey
                    ? `/uploads/${academyClass.coverKey}`
                    : undefined,
              );
              const tutors = new Set(
                academyClass.sessions
                  .map((session) => session.tutor?.name)
                  .filter((name): name is string => Boolean(name)),
              );
              const tutorSummary =
                tutors.size === 1
                  ? [...tutors][0]
                  : tutors.size > 1
                    ? "Multiple tutors"
                    : "Tutor to be announced";

              return (
                <Link
                  key={academyClass.id}
                  to="/classes/$classId"
                  params={{ classId: academyClass.id }}
                  className="block min-w-0"
                >
                  <Card className="min-w-0 overflow-hidden">
                    {coverUrl ? (
                      <img
                        src={coverUrl}
                        alt=""
                        className="aspect-video w-full object-cover"
                        loading="lazy"
                      />
                    ) : null}
                    <CardHeader>
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle>{academyClass.titleEn}</CardTitle>
                        <Badge variant="secondary">Cohort</Badge>
                      </div>
                      <CardDescription>
                        {academyClass.competition.parent
                          ? `${academyClass.competition.parent.name} · `
                          : ""}
                        {academyClass.competition.name}
                      </CardDescription>
                    </CardHeader>
                    <CardBody className="space-y-3">
                      <Text className="line-clamp-4 whitespace-pre-wrap text-muted">
                        {academyClass.descriptionEn}
                      </Text>
                      <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
                        <span>{academyClass.sessions.length} sessions</span>
                        <span>
                          Starts {formatSessionDate(firstSession.startAt)}
                        </span>
                        <span>{tutorSummary}</span>
                      </div>
                      <Text className="text-sm">
                        From{" "}
                        <CogitoMarks
                          value={academyClass.cohortFullRateMarks ?? 0}
                          size="3"
                        />{" "}
                        per session
                      </Text>
                      <details className="rounded-lg border border-border p-3">
                        <summary className="cursor-pointer font-medium">
                          Curriculum
                        </summary>
                        <ol className="mt-3 space-y-3">
                          {academyClass.sessions.map((session) => (
                            <li key={session.id}>
                              <Text className="font-medium">
                                {session.sequenceNumber}. {session.titleEn}
                              </Text>
                              {session.curriculumEn ? (
                                <Text className="mt-1 whitespace-pre-wrap text-sm text-muted">
                                  {session.curriculumEn}
                                </Text>
                              ) : null}
                            </li>
                          ))}
                        </ol>
                      </details>
                    </CardBody>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section aria-labelledby="upcoming-classes-heading">
        <div className="mb-4 flex items-center gap-2">
          <IconCalendarEvent
            className="size-5 text-primary"
            aria-hidden="true"
          />
          <Heading level={2} id="upcoming-classes-heading">
            Upcoming classes
          </Heading>
        </div>
        {upcoming.length === 0 ? (
          <EmptyStateCard
            size="compact"
            tone="secondary"
            icon={<IconCalendarEvent />}
            title="Nothing upcoming yet"
            description="New masterclasses and cohort sessions will appear here."
          />
        ) : (
          <div className="grid min-w-0 gap-3 md:grid-cols-2">
            {upcoming.map(({ academyClass, session }) => (
              <Link
                key={session.id}
                to="/classes/$classId"
                params={{ classId: academyClass.id }}
                className="block min-w-0"
              >
                <Card>
                  <CardBody className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Text className="font-medium">
                          {academyClass.titleEn}
                        </Text>
                        <Badge variant="secondary">
                          {academyClass.kind === "masterclass"
                            ? "Masterclass"
                            : "Cohort"}
                        </Badge>
                      </div>
                      <Text className="text-sm text-muted">
                        {academyClass.kind === "masterclass"
                          ? "Masterclass"
                          : `Cohort · Session ${session.sequenceNumber}`}
                        {` · ${session.titleEn}`}
                      </Text>
                      <Text className="text-sm text-muted">
                        {formatSessionDate(session.startAt)} ·{" "}
                        {session.mode === "online" ? "Online" : "In person"}
                      </Text>
                    </div>
                    <Text className="shrink-0">
                      <CogitoMarks
                        value={
                          academyClass.kind === "masterclass"
                            ? (academyClass.masterclassRateMarks ?? 0)
                            : (academyClass.cohortSingleRateMarks ??
                              academyClass.cohortFullRateMarks ??
                              0)
                        }
                        size="3"
                      />
                    </Text>
                  </CardBody>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </Stack>
  );
}
