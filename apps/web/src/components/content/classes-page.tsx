"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  IconArrowUpRight,
  IconCalendarEvent,
  IconSchool,
  IconSearch,
  IconUsers,
} from "@tabler/icons-react";
import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Button } from "@cogito-app/ui/components/selia/button";
import { Card, CardBody } from "@cogito-app/ui/components/selia/card";
import { Field, FieldLabel } from "@cogito-app/ui/components/selia/field";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { Input } from "@cogito-app/ui/components/selia/input";
import {
  InputGroup,
  InputGroupAddon,
} from "@cogito-app/ui/components/selia/input-group";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import { Separator } from "@cogito-app/ui/components/selia/separator";
import { Text } from "@cogito-app/ui/components/selia/text";
import { EmptyStateCard } from "@/components/empty-state";
import { CogitoMarks } from "@/components/cogito-marks";
import Loader from "@/components/loader";
import { resolveProfileImageUrl } from "@/lib/profile-image-url";
import { orpc } from "@/utils/orpc";
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
    <Stack direction="column" spacing="lg" className="w-full min-w-0 pb-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-2">
          <Heading level={1} size="md">
            Find your next class
          </Heading>
          <Text className="max-w-2xl text-muted">
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

      <Card>
        <CardBody className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-1">
            <Text className="font-semibold">Cohorts · Learn step by step</Text>
            <Text className="text-sm text-muted">
              Follow a sequence of sessions. Open a class to compare full, half,
              and single-session plans.
            </Text>
          </div>
          <div className="space-y-1">
            <Text className="font-semibold">
              Masterclasses · Focus on a topic
            </Text>
            <Text className="text-sm text-muted">
              Explore the topic, tutor, and schedule, then review your
              enrollment options.
            </Text>
          </div>
        </CardBody>
      </Card>

      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div
          role="group"
          aria-label="Class type"
          className="flex min-w-0 flex-wrap gap-1 rounded-xl bg-tabs p-1"
        >
          {[
            { value: "all", label: "All classes" },
            { value: "cohort", label: "Cohorts" },
            { value: "masterclass", label: "Masterclasses" },
          ].map((filter) => (
            <Button
              key={filter.value}
              variant={kind === filter.value ? "secondary" : "plain"}
              pill
              aria-pressed={kind === filter.value}
              onClick={() => setKind(filter.value)}
            >
              {filter.label}
            </Button>
          ))}
        </div>
        <Field className="w-full sm:max-w-xs">
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
            <Text className="text-sm text-muted" role="status">
              Loading classes…
            </Text>
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
            <Text className="text-sm text-muted" role="status">
              {visibleClasses.length} class
              {visibleClasses.length === 1 ? "" : "es"}
              {query || kind !== "all" ? " found" : " available"} · All times in
              WIB
            </Text>
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
                  const coverUrl = resolveProfileImageUrl(
                    academyClass.coverKey?.startsWith("http")
                      ? academyClass.coverKey
                      : academyClass.coverKey
                        ? `/uploads/${academyClass.coverKey}`
                        : undefined,
                  );
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
                      <CardBody className="flex h-full min-w-0 flex-col gap-3 p-4">
                        <div className="flex min-w-0 items-start gap-3">
                          {coverUrl ? (
                            <img
                              src={coverUrl}
                              alt=""
                              className="size-14 shrink-0 rounded-lg bg-accent object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div
                              className="flex size-14 shrink-0 flex-col items-center justify-center rounded-lg bg-accent"
                              aria-hidden="true"
                            >
                              <span className="text-xs font-medium uppercase text-muted">
                                {month}
                              </span>
                              <span className="text-xl font-semibold tabular-nums">
                                {day}
                              </span>
                            </div>
                          )}
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge variant="secondary" size="sm">
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
                            <Text className="line-clamp-1 text-xs font-medium text-muted">
                              {academyClass.competition.parent
                                ? `${academyClass.competition.parent.name} · `
                                : ""}
                              {academyClass.competition.name}
                            </Text>
                            <Heading
                              level={2}
                              size="sm"
                              className="line-clamp-2 break-words leading-snug group-hover:underline"
                            >
                              {academyClass.titleEn}
                            </Heading>
                          </div>
                        </div>
                        <Text className="line-clamp-2 min-h-10 text-sm leading-relaxed text-muted">
                          {academyClass.descriptionEn}
                        </Text>
                        <div className="mt-auto">
                          <Separator className="my-3" />
                          <div className="flex min-w-0 items-start gap-3">
                            <div className="flex min-w-0 flex-1 items-start gap-2">
                              <IconCalendarEvent
                                className="mt-0.5 size-4 shrink-0 text-dimmed"
                                aria-hidden="true"
                              />
                              <div className="min-w-0">
                                <Text className="line-clamp-1 text-xs font-medium">
                                  {nextSession ? "Next" : "Started"} ·{" "}
                                  {formattedDate}
                                </Text>
                                <Text className="text-xs text-muted">
                                  {formattedTime} WIB ·{" "}
                                  {academyClass.sessions.length} session
                                  {academyClass.sessions.length === 1
                                    ? ""
                                    : "s"}
                                </Text>
                              </div>
                            </div>
                            <div className="shrink-0 text-right">
                              <Text className="font-semibold tabular-nums">
                                <CogitoMarks
                                  value={
                                    academyClass.kind === "cohort"
                                      ? (academyClass.cohortFullRateMarks ?? 0)
                                      : (academyClass.masterclassRateMarks ?? 0)
                                  }
                                />
                              </Text>
                              <Text className="text-xs text-muted">
                                {academyClass.kind === "cohort"
                                  ? "per session · full plan"
                                  : "per student"}
                              </Text>
                            </div>
                          </div>
                          <div className="mt-2 flex min-w-0 items-center gap-2">
                            <IconUsers
                              className="size-4 shrink-0 text-dimmed"
                              aria-hidden="true"
                            />
                            <Text className="min-w-0 flex-1 truncate text-xs text-muted">
                              {tutors.length
                                ? tutors.join(", ")
                                : "Tutor to be announced"}
                            </Text>
                            <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-foreground">
                              Details <IconArrowUpRight className="size-4" />
                            </span>
                          </div>
                        </div>
                      </CardBody>
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
