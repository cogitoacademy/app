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
import {
  Card,
  CardBody,
  CardFooter,
} from "@cogito-app/ui/components/selia/card";
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
import Loader from "@/components/loader";
import { resolveProfileImageUrl } from "@/lib/profile-image-url";
import { orpc } from "@/utils/orpc";
import { useNow } from "@/hooks/use-now";

export function ClassesPage() {
  const now = useNow();
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState("all");
  const classes = useQuery(orpc.classes.list.queryOptions());

  if (classes.isPending) return <Loader />;
  if (classes.isError) {
    return (
      <EmptyStateCard
        icon={<IconSchool />}
        title="Classes unavailable"
        description="We could not load the class catalog. Please try again."
        action={
          <Button onClick={() => void classes.refetch()}>Try again</Button>
        }
      />
    );
  }

  const publishedClasses = classes.data.filter(
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
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <Heading level={1}>Classes</Heading>
          <Text className="max-w-2xl text-muted">
            Find your next competition class. Follow a cohort or join a focused
            masterclass.
          </Text>
        </div>
        <Button
          variant="secondary"
          nativeButton={false}
          render={<Link to="/class-reports" aria-label="Session reports" />}
        >
          <IconCalendarEvent /> Session reports
        </Button>
      </div>

      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div
          role="group"
          aria-label="Class type"
          className="flex min-w-0 flex-wrap gap-2"
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
        <Text className="text-sm text-muted" role="status">
          {visibleClasses.length} class{visibleClasses.length === 1 ? "" : "es"}
          {query || kind !== "all" ? " found" : " available"} · All times in WIB
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
          <div className="grid min-w-0 items-stretch gap-5 md:grid-cols-2 2xl:grid-cols-3">
            {visibleClasses.map((academyClass) => {
              const nextSession = academyClass.sessions.find(
                (session) => new Date(session.startAt).getTime() > now,
              );
              const firstSession = nextSession ?? academyClass.sessions[0];
              if (!firstSession) return null;
              const date = new Date(firstSession.startAt);
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
                  className="flex min-w-0 flex-col overflow-hidden"
                  data-testid={`class-card-${academyClass.id}`}
                >
                  {coverUrl ? (
                    <img
                      src={coverUrl}
                      alt=""
                      className="aspect-[2.4/1] w-full object-cover"
                      loading="lazy"
                    />
                  ) : null}
                  <CardBody className="flex flex-1 flex-col gap-5">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">
                          {academyClass.kind === "cohort"
                            ? "Cohort"
                            : "Masterclass"}
                        </Badge>
                        {academyClass.state === "postponed" ? (
                          <Badge variant="warning">Postponed</Badge>
                        ) : null}
                      </div>
                      <div className="space-y-2">
                        <Text className="text-xs font-medium text-muted">
                          {academyClass.competition.parent
                            ? `${academyClass.competition.parent.name} · `
                            : ""}
                          {academyClass.competition.name}
                        </Text>
                        <Heading
                          level={2}
                          size="sm"
                          className="break-words leading-snug"
                        >
                          <Link
                            to="/classes/$classId"
                            params={{ classId: academyClass.id }}
                            className="rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
                          >
                            {academyClass.titleEn}
                          </Link>
                        </Heading>
                        <Text className="line-clamp-3 whitespace-pre-wrap text-sm text-muted">
                          {academyClass.descriptionEn}
                        </Text>
                      </div>
                    </div>
                    <div className="mt-auto flex items-start gap-4 border-t border-border pt-4">
                      <div
                        className="shrink-0 rounded-lg bg-accent px-3 py-2 text-center"
                        aria-hidden="true"
                      >
                        <span className="block text-xs font-medium uppercase text-muted">
                          {new Intl.DateTimeFormat("en", {
                            month: "short",
                            timeZone: "Asia/Jakarta",
                          }).format(date)}
                        </span>
                        <span className="block text-xl font-semibold tabular-nums">
                          {new Intl.DateTimeFormat("en", {
                            day: "numeric",
                            timeZone: "Asia/Jakarta",
                          }).format(date)}
                        </span>
                      </div>
                      <div className="min-w-0 space-y-1 text-sm">
                        <Text className="font-medium">
                          {nextSession ? "Next session" : "Started"} ·{" "}
                          {new Intl.DateTimeFormat("en", {
                            dateStyle: "medium",
                            timeZone: "Asia/Jakarta",
                          }).format(date)}
                        </Text>
                        <Text className="text-muted">
                          {new Intl.DateTimeFormat("en", {
                            timeStyle: "short",
                            timeZone: "Asia/Jakarta",
                          }).format(date)}{" "}
                          WIB · {academyClass.sessions.length} session
                          {academyClass.sessions.length === 1 ? "" : "s"}
                        </Text>
                        <Text className="flex items-start gap-2 text-muted">
                          <IconUsers
                            className="mt-0.5 size-4 shrink-0"
                            aria-hidden="true"
                          />
                          <span className="break-words">
                            {tutors.length
                              ? tutors.join(", ")
                              : "Tutor to be announced"}
                          </span>
                        </Text>
                      </div>
                    </div>
                  </CardBody>
                  <CardFooter className="flex-wrap justify-between gap-3">
                    <div>
                      <Text className="font-semibold">
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
                          ? "per session · full cohort plan"
                          : "per student"}
                      </Text>
                    </div>
                    <Button
                      variant="secondary"
                      nativeButton={false}
                      render={
                        <Link
                          to="/classes/$classId"
                          params={{ classId: academyClass.id }}
                          aria-label={`View ${academyClass.titleEn}`}
                        />
                      }
                    >
                      View class <IconArrowUpRight />
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </Stack>
  );
}
