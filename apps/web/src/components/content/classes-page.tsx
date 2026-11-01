"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  IconClock,
  IconMapPin,
  IconChevronRight,
  IconCalendarEvent,
  IconSchool,
  IconSearch,
  IconUsers,
} from "@tabler/icons-react";
import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Button, buttonVariants } from "@cogito-app/ui/components/selia/button";
import { Card } from "@cogito-app/ui/components/selia/card";
import { Field, FieldLabel } from "@cogito-app/ui/components/selia/field";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { Input } from "@cogito-app/ui/components/selia/input";
import {
  InputGroup,
  InputGroupAddon,
} from "@cogito-app/ui/components/selia/input-group";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import { Text } from "@cogito-app/ui/components/selia/text";
import { EmptyStateCard } from "@/components/empty-state";
import { CogitoMarks } from "@/components/cogito-marks";
import { FilterTabBar } from "@/components/filter-tab-bar";
import Loader from "@/components/loader";
import { orpc } from "@/utils/orpc";
import {
  competitionPaletteClassName,
  getCompetitionPalette,
  getCompetitionPaletteStyle,
} from "@/lib/competition-colors";
import { useNow } from "@/hooks/use-now";

export function ClassesPage() {
  const now = useNow();
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("all");
  const classes = useQuery(orpc.classes.list.queryOptions());

  const publishedClasses = (classes.data ?? []).filter(
    (item) => item.sessions.length > 0,
  );
  const query = search.trim().toLocaleLowerCase();
  const visibleClasses = publishedClasses.filter(
    (item) =>
      (kind === "all" || item.kind === kind) &&
      (!query ||
        `${item.titleEn} ${item.competition.name} ${item.competition.parent?.name ?? ""}`
          .toLocaleLowerCase()
          .includes(query)),
  );

  return (
    <Stack
      direction="column"
      spacing="md"
      className="w-full min-w-0 flex-nowrap pb-8"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 max-w-full">
          <Heading level={1} size="md">
            Find your next class
          </Heading>
          <Text className="max-w-full text-muted">
            Prepare for your competition with a cohort or a focused masterclass.
          </Text>
        </div>
        <Button
          variant="secondary"
          nativeButton={false}
          render={<Link to="/class-reports" aria-label="My class reports" />}
        >
          <IconCalendarEvent /> My class reports
        </Button>
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 basis-full flex-col gap-2 sm:basis-auto sm:flex-row sm:items-center sm:gap-4">
          <div className="min-w-0 sm:shrink">
            <FilterTabBar
              label="Class type"
              activeTab={kind}
              onChange={setKind}
              tabs={[
                { value: "all", label: "All classes" },
                { value: "cohort", label: "Cohorts" },
                { value: "masterclass", label: "Masterclasses" },
              ]}
            />
          </div>
          {!classes.isPending && !classes.isError ? (
            <Text
              className="shrink-0 whitespace-nowrap text-sm text-muted"
              role="status"
            >
              {visibleClasses.length} class
              {visibleClasses.length === 1 ? "" : "es"}
              {query || kind !== "all" ? " found" : " available"} · All times in
              WIB
            </Text>
          ) : null}
        </div>
        <Field className="w-full sm:w-64 sm:shrink-0">
          <FieldLabel htmlFor="class-search" className="sr-only">
            Search classes
          </FieldLabel>
          <InputGroup>
            <InputGroupAddon>
              <IconSearch aria-hidden="true" />
            </InputGroupAddon>
            <Input
              id="class-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search classes or competitions"
            />
          </InputGroup>
        </Field>
      </div>

      <section aria-label="Class catalog" className="min-w-0 space-y-4">
        {classes.isPending ? (
          <div aria-busy="true">
            <Loader />
            <Loader />
          </div>
        ) : classes.isError ? (
          <EmptyStateCard
            icon={<IconSchool />}
            title="Classes unavailable"
            description="We could not load the class catalog. Try again to see available classes."
            action={
              <Button
                variant="secondary"
                onClick={() => void classes.refetch()}
                progress={classes.isFetching}
              >
                Try again
              </Button>
            }
          />
        ) : (
          <>
            {visibleClasses.length === 0 ? (
              <EmptyStateCard
                tone="secondary"
                icon={<IconSchool />}
                title={
                  publishedClasses.length
                    ? "No matching classes"
                    : "New classes are on the way"
                }
                description={
                  publishedClasses.length
                    ? "Try another class name, competition, or class type."
                    : "Published cohorts and masterclasses will appear here."
                }
                action={
                  publishedClasses.length ? (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setSearch("");
                        setKind("all");
                      }}
                    >
                      Clear filters
                    </Button>
                  ) : undefined
                }
              />
            ) : (
              <div className="grid min-w-0 items-stretch gap-4 md:grid-cols-2 2xl:grid-cols-3">
                {visibleClasses.map((academyClass) => {
                  const nextSession = academyClass.sessions.find(
                    (session) => new Date(session.startAt).getTime() > now,
                  );
                  const firstSession = nextSession ?? academyClass.sessions[0];
                  if (!firstSession) return null;
                  const rates = (
                    academyClass.kind === "cohort"
                      ? [
                          academyClass.cohortFullRateMarks,
                          academyClass.cohortHalfRateMarks,
                          academyClass.cohortSingleRateMarks,
                        ]
                      : [academyClass.masterclassRateMarks]
                  ).filter((rate): rate is number => rate !== null && rate > 0);
                  const startingRate = rates.length ? Math.min(...rates) : null;
                  const palette = getCompetitionPalette(
                    academyClass.competition.parent ?? academyClass.competition,
                  );
                  const cohortDates = academyClass.sessions
                    .map((session) => new Date(session.startAt).getTime())
                    .toSorted((left, right) => left - right);
                  const cohortDateFormatter = new Intl.DateTimeFormat("en", {
                    dateStyle: "medium",
                    timeZone: "Asia/Jakarta",
                  });
                  const cohortDateRange = `${cohortDateFormatter.format(cohortDates[0])} – ${cohortDateFormatter.format(cohortDates[cohortDates.length - 1])}`;
                  const date = new Date(firstSession.startAt);
                  const month = new Intl.DateTimeFormat("en", {
                    month: "short",
                    timeZone: "Asia/Jakarta",
                  }).format(date);
                  const day = new Intl.DateTimeFormat("en", {
                    day: "numeric",
                    timeZone: "Asia/Jakarta",
                  }).format(date);
                  const formattedDate = new Intl.DateTimeFormat("en", {
                    dateStyle: "medium",
                    timeZone: "Asia/Jakarta",
                  }).format(date);
                  const formattedTime = new Intl.DateTimeFormat("en", {
                    timeStyle: "short",
                    timeZone: "Asia/Jakarta",
                  }).format(date);
                  const tutors = [
                    ...new Set(
                      academyClass.sessions
                        .map((session) => session.tutor?.name)
                        .filter(Boolean),
                    ),
                  ];
                  return (
                    <Card
                      key={academyClass.id}
                      render={
                        <Link
                          to="/classes/$classId"
                          params={{ classId: academyClass.id }}
                          aria-label={`View details and enrollment for ${academyClass.titleEn}`}
                        />
                      }
                      className="group flex h-full min-w-0 flex-col text-foreground no-underline transition-all duration-200 motion-safe:hover:-translate-y-0.5 hover:shadow-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none"
                      data-testid={`class-card-${academyClass.id}`}
                    >
                      <div className="flex h-full min-w-0 flex-col gap-3 p-4">
                        <Heading
                          level={2}
                          size="sm"
                          className="line-clamp-2 wrap-anywhere leading-snug"
                          title={academyClass.titleEn}
                        >
                          {academyClass.titleEn}
                        </Heading>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant="secondary"
                            size="sm"
                            className={
                              palette ? competitionPaletteClassName : undefined
                            }
                            style={getCompetitionPaletteStyle(palette)}
                          >
                            {academyClass.competition.parent
                              ? `${academyClass.competition.parent.name} · `
                              : ""}
                            {academyClass.competition.name}
                          </Badge>
                          <Badge variant="tertiary" size="sm">
                            {academyClass.kind === "cohort"
                              ? "Cohort"
                              : "Masterclass"}
                          </Badge>
                          {academyClass.state === "postponed" ? (
                            <Badge variant="warning" size="sm">
                              Postponed
                            </Badge>
                          ) : null}
                        </div>
                        <div className="flex min-w-0 items-center gap-3">
                          <div
                            className="flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-lg bg-accent"
                            aria-hidden="true"
                          >
                            <span className="text-sm uppercase">
                              {new Intl.DateTimeFormat("en", {
                                weekday: "short",
                                timeZone: "Asia/Jakarta",
                              }).format(date)}
                            </span>
                            <span className="text-2xl font-semibold tabular-nums">
                              {day}
                            </span>
                            <span className="text-sm uppercase">{month}</span>
                          </div>
                          <div className="flex min-w-0 flex-1 flex-col gap-1">
                            <Text className="flex items-center gap-2">
                              {academyClass.kind === "cohort" ? (
                                <IconCalendarEvent
                                  className="size-4 shrink-0 text-muted"
                                  aria-hidden="true"
                                />
                              ) : (
                                <IconClock
                                  className="size-4 shrink-0 text-muted"
                                  aria-hidden="true"
                                />
                              )}
                              {academyClass.kind === "cohort"
                                ? cohortDateRange
                                : `${formattedDate} · ${formattedTime} WIB`}
                            </Text>
                            <Text className="flex items-center gap-2 text-muted">
                              <IconMapPin
                                className="size-4 shrink-0"
                                aria-hidden="true"
                              />
                              {firstSession.mode === "online"
                                ? "Online"
                                : "Offline"}
                            </Text>
                            <Text className="flex min-w-0 items-center gap-2 text-muted">
                              {academyClass.kind === "cohort" ? (
                                <IconCalendarEvent
                                  className="size-4 shrink-0"
                                  aria-hidden="true"
                                />
                              ) : (
                                <IconUsers
                                  className="size-4 shrink-0"
                                  aria-hidden="true"
                                />
                              )}
                              <span className="truncate">
                                {academyClass.kind === "cohort"
                                  ? `${academyClass.sessions.length} session${academyClass.sessions.length === 1 ? "" : "s"}`
                                  : tutors.length
                                    ? tutors.join(", ")
                                    : "Tutor to be announced"}
                              </span>
                            </Text>
                          </div>
                        </div>
                        {academyClass.kind === "cohort" ? (
                          <Text className="text-sm text-muted">
                            {nextSession
                              ? "Enroll before your selected session starts · subject to availability"
                              : "No upcoming sessions"}
                          </Text>
                        ) : null}
                        <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
                          <div className="flex flex-wrap items-center gap-x-1 text-muted">
                            {startingRate !== null ? (
                              <>
                                <span className="text-sm">Start from</span>
                                <CogitoMarks value={startingRate} />
                              </>
                            ) : (
                              <span className="text-sm">Price unavailable</span>
                            )}
                          </div>
                          <span
                            className={buttonVariants({
                              size: "sm",
                              className: "shrink-0",
                            })}
                          >
                            Details{" "}
                            <IconChevronRight
                              className="size-4"
                              aria-hidden="true"
                            />
                          </span>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}
      </section>
    </Stack>
  );
}
