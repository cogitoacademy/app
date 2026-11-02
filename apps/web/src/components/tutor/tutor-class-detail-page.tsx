"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  IconArrowLeft,
  IconArrowUpRight,
  IconCalendarEvent,
  IconDeviceLaptop,
  IconMapPin,
  IconSchool,
} from "@tabler/icons-react";
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "@cogito-app/ui/components/selia/accordion";
import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Button } from "@cogito-app/ui/components/selia/button";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { IconBox } from "@cogito-app/ui/components/selia/icon-box";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import { Text } from "@cogito-app/ui/components/selia/text";

import { EmptyStateCard } from "@/components/empty-state";
import Loader from "@/components/loader";
import { useNow } from "@/hooks/use-now";
import {
  classSessionReference,
  classSessionStart,
  formatClassSessionDate,
  formatClassSessionTime,
  getClassSessionStatus,
} from "@/lib/class-session-presentation";
import { getUserFacingError } from "@/lib/error-message";
import { orpc } from "@/utils/orpc";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@cogito-app/ui/components/selia/field";
import { Input } from "@cogito-app/ui/components/selia/input";
import { toastManager } from "@cogito-app/ui/components/selia/toast";

const kindLabels = {
  cohort: "Cohort",
  masterclass: "Masterclass",
} as const;

export function TutorClassDetailPage({ classId }: { classId: string }) {
  const now = useNow();
  const queryClient = useQueryClient();
  const [absenceReason, setAbsenceReason] = useState<Record<string, string>>(
    {},
  );
  const [absenceRequestKey, setAbsenceRequestKey] = useState<
    Record<string, string>
  >({});
  const classQuery = useQuery(
    orpc.classes.listSessionReports.queryOptions({ input: { classId } }),
  );
  const reportAbsence = useMutation(
    orpc.admin.reportTutorAbsence.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: orpc.classes.listSessionReports.key(),
        });
        toastManager.add({
          title: "Absence notice recorded",
          type: "success",
        });
      },
      onError: (error) =>
        toastManager.add({
          title: "Absence notice could not be recorded",
          description: getUserFacingError(error),
          type: "error",
        }),
    }),
  );

  if (classQuery.isPending) return <Loader />;

  const sessions = classQuery.data ?? [];
  const first = sessions[0];

  return (
    <Stack direction="column" spacing="md">
      <Button
        variant="underline"
        size="sm"
        className="self-start"
        nativeButton={false}
        render={<Link to="/my-classes" aria-label="Back to my classes" />}
      >
        <IconArrowLeft className="size-4" />
        Back to my classes
      </Button>

      {classQuery.isError ? (
        <EmptyStateCard
          icon={<IconSchool />}
          tone="danger"
          title="Class could not be loaded"
          description="Try loading this class again."
          action={
            <Button
              variant="secondary"
              onClick={() => void classQuery.refetch()}
            >
              Try again
            </Button>
          }
        />
      ) : !first ? (
        <EmptyStateCard
          icon={<IconSchool />}
          title="Class not found"
          description="This class is not assigned to you, or it is no longer available."
        />
      ) : (
        <>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="info">{kindLabels[first.classKind]}</Badge>
              <Badge variant="secondary">{classSessionReference(first)}</Badge>
            </div>
            <Heading level={1} size="md" className="mt-2">
              {first.classTitle}
            </Heading>
            <Text className="max-w-full text-muted">
              {first.classDescription}
            </Text>
          </div>

          <section aria-labelledby="my-sessions-heading" className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Heading level={2} size="sm" id="my-sessions-heading">
                Your sessions
              </Heading>
              <Text className="text-xs text-muted">WIB · UTC+7</Text>
            </div>
            <Text className="text-sm text-muted">
              {sessions.length}{" "}
              {sessions.length === 1 ? "session assigned" : "sessions assigned"}{" "}
              to you.
            </Text>
            <Accordion multiple className="gap-3">
              {sessions.map((session) => {
                const status = getClassSessionStatus(session, now);
                const canReport =
                  session.state === "scheduled" &&
                  classSessionStart(session.startAt) <= now;
                return (
                  <AccordionItem
                    key={session.sessionId}
                    value={session.sessionId}
                    className="rounded-lg border border-card-border bg-card px-2 last:border-b"
                  >
                    <AccordionHeader render={<h3 />}>
                      <AccordionTrigger className="py-2">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded bg-accent tabular-nums">
                          <span className="sr-only">Session </span>
                          {session.sequenceNumber}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col text-left">
                          <span className="wrap-anywhere font-semibold">
                            {session.sessionTitle}
                          </span>
                          <span className="text-sm font-normal text-muted">
                            {formatClassSessionDate(session.startAt)} ·{" "}
                            {formatClassSessionTime(session.startAt)}–
                            {formatClassSessionTime(session.endAt)}
                          </span>
                        </span>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </AccordionTrigger>
                    </AccordionHeader>
                    <AccordionPanel>
                      <div className="space-y-4 wrap-anywhere pb-3 sm:pl-12">
                        <Text className="whitespace-pre-wrap text-sm leading-relaxed">
                          {session.curriculumEn ||
                            "Curriculum to be announced."}
                        </Text>

                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="flex min-w-0 items-start gap-3">
                            <IconBox
                              variant="tertiary"
                              size="md"
                              aria-hidden="true"
                            >
                              {session.mode === "online" ? (
                                <IconDeviceLaptop />
                              ) : (
                                <IconMapPin />
                              )}
                            </IconBox>
                            <div className="min-w-0">
                              <Text className="text-sm text-muted">Format</Text>
                              <Text className="font-medium">
                                {session.mode === "online"
                                  ? "Online"
                                  : "In person"}
                              </Text>
                            </div>
                          </div>
                          <div className="flex min-w-0 items-start gap-3">
                            <IconBox
                              variant="tertiary"
                              size="md"
                              aria-hidden="true"
                            >
                              <IconCalendarEvent />
                            </IconBox>
                            <div className="min-w-0">
                              <Text className="text-sm text-muted">
                                {session.mode === "online" ? "Meeting" : "Room"}
                              </Text>
                              <JoinDetails session={session} />
                            </div>
                          </div>
                        </div>

                        {session.state === "scheduled" &&
                        !session.absenceReportedAt ? (
                          <form
                            className="space-y-3 border-t border-border pt-3"
                            onSubmit={async (event) => {
                              event.preventDefault();
                              const reason =
                                absenceReason[session.sessionId]?.trim() ?? "";
                              if (reason.length < 3) return;
                              try {
                                const requestKey =
                                  absenceRequestKey[session.sessionId] ??
                                  crypto.randomUUID();
                                setAbsenceRequestKey((current) => ({
                                  ...current,
                                  [session.sessionId]: requestKey,
                                }));
                                await reportAbsence.mutateAsync({
                                  sessionId: session.sessionId,
                                  requestKey,
                                  reason,
                                });
                                setAbsenceReason((current) => ({
                                  ...current,
                                  [session.sessionId]: "",
                                }));
                                setAbsenceRequestKey((current) => {
                                  const next = { ...current };
                                  delete next[session.sessionId];
                                  return next;
                                });
                              } catch {
                                // The mutation reports the actionable error.
                              }
                            }}
                          >
                            <Text className="font-medium">
                              Report tutor absence
                            </Text>
                            <Field>
                              <FieldLabel
                                htmlFor={`absence-${session.sessionId}`}
                                required
                              >
                                Reason
                              </FieldLabel>
                              <Input
                                id={`absence-${session.sessionId}`}
                                value={absenceReason[session.sessionId] ?? ""}
                                onChange={(event) =>
                                  setAbsenceReason((current) => ({
                                    ...current,
                                    [session.sessionId]: event.target.value,
                                  }))
                                }
                                maxLength={1000}
                                required
                                aria-required="true"
                              />
                              <FieldDescription>
                                Submitted notices include the server time.
                                Notices within 24 hours of session start are
                                marked late.
                              </FieldDescription>
                            </Field>
                            <Button
                              type="submit"
                              variant="secondary"
                              size="sm"
                              disabled={
                                (absenceReason[session.sessionId]?.trim()
                                  .length ?? 0) < 3 || reportAbsence.isPending
                              }
                            >
                              Report absence
                            </Button>
                          </form>
                        ) : session.absenceReportedAt ? (
                          <Text className="text-sm text-warning">
                            Absence reported
                            {session.absenceLate ? " · Late notice" : ""}
                          </Text>
                        ) : null}

                        {session.report || canReport ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            nativeButton={false}
                            render={
                              <Link
                                to="/class-reports"
                                search={{
                                  report: `class:${session.sessionId}`,
                                }}
                                aria-label={`${session.report ? "View" : "Record"} report for session ${session.sequenceNumber}`}
                              />
                            }
                          >
                            {session.report ? "View report" : "Record report"}
                          </Button>
                        ) : null}
                      </div>
                    </AccordionPanel>
                  </AccordionItem>
                );
              })}
            </Accordion>
          </section>
        </>
      )}
    </Stack>
  );
}

function JoinDetails({
  session,
}: {
  session: {
    mode: "online" | "in_person";
    state: "scheduled" | "completed" | "cancelled";
    meeting: { status: string; meetingUrl: string | null } | null;
    room: { name: string; location: string } | null;
  };
}) {
  if (session.state === "cancelled") {
    return <Text className="text-sm text-muted">Session cancelled.</Text>;
  }
  if (session.state === "completed") {
    return <Text className="text-sm text-muted">Session completed.</Text>;
  }
  if (session.mode === "in_person") {
    return session.room ? (
      <>
        <Text className="font-medium">{session.room.name}</Text>
        <Text className="text-sm text-muted">{session.room.location}</Text>
      </>
    ) : (
      <Text className="text-sm text-muted">Room to be announced.</Text>
    );
  }
  if (session.meeting?.meetingUrl) {
    return (
      <Button
        variant="tertiary"
        size="xs"
        nativeButton={false}
        render={
          <a
            href={session.meeting.meetingUrl}
            target="_blank"
            rel="noreferrer"
            aria-label="Open meeting room"
          />
        }
      >
        <IconDeviceLaptop aria-hidden="true" />
        Join meeting
        <IconArrowUpRight aria-hidden="true" />
      </Button>
    );
  }
  if (session.meeting?.status === "failed") {
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
