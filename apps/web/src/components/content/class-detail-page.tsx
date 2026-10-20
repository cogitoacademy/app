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
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(date));
}

export function ClassDetailPage() {
  const { classId } = useParams({ from: "/_app/classes/$classId" });
  const academyClass = useQuery(
    orpc.classes.get.queryOptions({ input: { id: classId } }),
  );

  if (academyClass.isPending) return <Loader />;
  if (academyClass.isError || academyClass.data.state !== "published") {
    return (
      <EmptyStateCard
        icon={<IconSchool />}
        title="Class unavailable"
        description="This class is no longer available. Return to the class catalog to browse current offerings."
        action={
          <Button
            nativeButton={false}
            render={<Link to="/classes">Browse classes</Link>}
          >
            <IconArrowLeft />
            Browse classes
          </Button>
        }
      />
    );
  }

  const coverUrl = academyClass.data.coverKey?.startsWith("http")
    ? resolveProfileImageUrl(academyClass.data.coverKey)
    : resolveProfileImageUrl(
        academyClass.data.coverKey
          ? `/uploads/${academyClass.data.coverKey}`
          : undefined,
      );

  return (
    <Stack direction="column" spacing="lg" className="w-full min-w-0 pb-8">
      <Button
        nativeButton={false}
        variant="plain"
        render={<Link to="/classes" />}
        className="w-fit"
      >
        <IconArrowLeft />
        All classes
      </Button>
      {coverUrl ? (
        <img
          src={coverUrl}
          alt=""
          className="aspect-[2.2/1] max-h-96 w-full rounded-xl border border-card-border object-cover"
        />
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">
              {academyClass.data.kind === "cohort" ? "Cohort" : "Masterclass"}
            </Badge>
            <Badge variant="info">
              {academyClass.data.sessions.length} session
              {academyClass.data.sessions.length === 1 ? "" : "s"}
            </Badge>
          </div>
          <Heading level={1}>{academyClass.data.titleEn}</Heading>
          <Text className="mt-2 text-muted">
            {academyClass.data.competition.parent
              ? `${academyClass.data.competition.parent.name} · `
              : ""}
            {academyClass.data.competition.name}
          </Text>
        </div>
        <div className="text-lg font-semibold">
          <CogitoMarks
            value={
              academyClass.data.kind === "cohort"
                ? academyClass.data.cohortFullRateMarks ?? 0
                : academyClass.data.masterclassRateMarks ?? 0
            }
          />
          <span className="ml-1 text-sm font-normal text-muted">
            {academyClass.data.kind === "cohort" ? "per cohort session" : "per student"}
          </span>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>About this class</CardTitle>
          <CardDescription>Class overview and learning plan</CardDescription>
        </CardHeader>
        <CardBody>
          <Text className="whitespace-pre-wrap">{academyClass.data.descriptionEn}</Text>
        </CardBody>
      </Card>

      <section aria-labelledby="class-sessions-heading">
        <div className="mb-4 flex items-center gap-2">
          <IconCalendarEvent className="size-5 text-primary" aria-hidden="true" />
          <Heading level={2} id="class-sessions-heading">
            {academyClass.data.kind === "cohort" ? "Curriculum and schedule" : "Session details"}
          </Heading>
        </div>
        <ol className="space-y-3">
          {academyClass.data.sessions.map((session) => (
            <li key={session.id}>
              <Card>
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle>
                        {academyClass.data.kind === "cohort"
                          ? `Session ${session.sequenceNumber}: ${session.titleEn}`
                          : session.titleEn}
                      </CardTitle>
                      <CardDescription>
                        {formatSessionDate(session.startAt)} · {session.mode === "online" ? "Online" : "In person"}
                      </CardDescription>
                    </div>
                    <Badge variant={session.mode === "online" ? "info" : "success"}>
                      {session.mode === "online" ? "Online" : "In person"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardBody className="space-y-3">
                  {session.curriculumEn ? (
                    <Text className="whitespace-pre-wrap">{session.curriculumEn}</Text>
                  ) : null}
                  <Text className="text-sm text-muted">
                    Tutor: {session.tutor?.name ?? "To be announced"}
                  </Text>
                  {session.mode === "online" ? (
                    <Text className="text-sm text-muted">
                      The meeting link will be available to enrolled students.
                    </Text>
                  ) : null}
                </CardBody>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      <Text className="text-sm text-muted">
        Class details only. Enrollment will open when registration is ready.
      </Text>
    </Stack>
  );
}
