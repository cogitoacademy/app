"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  IconArrowsExchange,
  IconCalendarTime,
  IconUser,
} from "@tabler/icons-react";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Field,
  FieldLabel,
  FieldDescription,
} from "@cogito-app/ui/components/selia/field";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { IconBox } from "@cogito-app/ui/components/selia/icon-box";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectPopup,
  SelectList,
  SelectItem,
} from "@cogito-app/ui/components/selia/select";
import { Text } from "@cogito-app/ui/components/selia/text";
import { toastManager } from "@cogito-app/ui/components/selia/toast";
import { ClassActionReason } from "./class-action-reason";
import { CrossBrowserDateTimeInput } from "@/components/booking/minute-time-input";
import { getUserFacingError } from "@/lib/error-message";
import { client, orpc } from "@/utils/orpc";
import { ClassAdminLifecyclePanel } from "./class-admin-lifecycle-panel";

type ClassRecord = Awaited<ReturnType<typeof client.admin.getAcademyClass>>;

function toWibDateTimeInput(value: Date | string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Jakarta",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

function fromWibDateTimeInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00+07:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function ClassAdminManagement({
  record,
  onChanged,
  sessionOnly = false,
}: {
  record: ClassRecord;
  sessionOnly?: boolean;
  onChanged: () => Promise<unknown>;
}) {
  const [replacementTutorIds, setReplacementTutorIds] = useState<
    Record<string, string>
  >({});
  const [rescheduleValues, setRescheduleValues] = useState<
    Record<string, { startAt: string; reason: string }>
  >({});
  const tutorsQuery = useQuery(
    orpc.adminTutor.listTutorProfiles.queryOptions({
      input: { status: "published", limit: 100, offset: 0 },
    }),
  );
  const tutors = tutorsQuery.data ?? [];
  const onlineSessions = record.sessions.filter(
    (session) => session.mode === "online",
  );
  const failedMeetings = onlineSessions.filter(
    (session) => session.meeting?.status === "failed",
  );
  const pendingMeetings = onlineSessions.filter(
    (session) => !["created", "failed"].includes(session.meeting?.status ?? ""),
  ).length;
  const absenceNotices = record.sessions.flatMap((session) =>
    session.tutorAbsences.map((notice) => ({ session, notice })),
  );
  const retryClassMeetings = useMutation(
    orpc.admin.retryAcademyClassMeetings.mutationOptions({
      onSuccess: async (updatedClass) => {
        await onChanged();
        const updatedOnlineSessions = updatedClass.sessions.filter(
          (session) => session.mode === "online",
        );
        const failed = updatedOnlineSessions.filter(
          (session) => session.meeting?.status === "failed",
        ).length;
        const ready = updatedOnlineSessions.filter(
          (session) => session.meeting?.status === "created",
        ).length;
        const pending = updatedOnlineSessions.length - failed - ready;
        toastManager.add({
          title: failed
            ? ready
              ? "Some meeting links could not be created"
              : "Meeting links could not be created"
            : pending
              ? "Meeting links are still pending"
              : "Meeting links created",
          description: `${updatedClass.titleEn}: ${ready} ready${failed ? ` · ${failed} failed` : ""}${pending ? ` · ${pending} pending` : ""}.`,
          type: failed ? "error" : pending ? "info" : "success",
        });
      },
      onError: (error: Error) => {
        toastManager.add({
          title: "Meeting link could not be created",
          description: getUserFacingError(error),
          type: "error",
        });
      },
    }),
  );
  const replaceAbsentTutor = useMutation(
    orpc.admin.replaceAbsentClassTutor.mutationOptions({
      onSuccess: async () => {
        await onChanged();
        toastManager.add({
          title: "Tutor replaced",
          description: "The session time and class fee stayed the same.",
          type: "success",
        });
      },
      onError: (error: Error) =>
        toastManager.add({
          title: "Tutor replacement failed",
          description: getUserFacingError(error),
          type: "error",
        }),
    }),
  );
  const rescheduleSession = useMutation(
    orpc.admin.rescheduleClassSession.mutationOptions({
      onSuccess: async (updatedClass) => {
        await onChanged();
        setRescheduleValues((current) => {
          const next = { ...current };
          for (const session of updatedClass.sessions) delete next[session.id];
          return next;
        });
        toastManager.add({
          title: "Session time updated",
          description:
            "Enrolled students can review the schedule-change exit window.",
          type: "success",
        });
      },
      onError: (error: Error) =>
        toastManager.add({
          title: "Session time could not be updated",
          description: getUserFacingError(error),
          type: "error",
        }),
    }),
  );

  if (!sessionOnly && failedMeetings.length === 0 && pendingMeetings === 0)
    return null;

  return (
    <section
      id={sessionOnly ? undefined : "class-management"}
      aria-label="Class management"
      className={
        sessionOnly
          ? "min-w-0 space-y-3 border-t border-border pt-3"
          : "min-w-0 space-y-4 border-t border-border pt-6"
      }
    >
      {!sessionOnly && (
        <Heading level={2} size="sm">
          Class management
        </Heading>
      )}
      {!sessionOnly && failedMeetings.length > 0 ? (
        <ClassActionReason
          label="Retry failed meeting setup"
          reasonLabel="Retry reason"
          disabled={retryClassMeetings.isPending}
          onConfirm={(reason) =>
            retryClassMeetings.mutateAsync({ id: record.id, reason })
          }
        />
      ) : !sessionOnly && pendingMeetings > 0 ? (
        <Text className="mt-3 text-sm text-muted">
          Meeting work is queued or running. Failed attempts are retried
          automatically.
        </Text>
      ) : null}
      <div className="space-y-4 pb-4">
        {sessionOnly &&
          record.sessions
            .filter((session) => session.state === "scheduled")
            .map((session) => {
              const edit = rescheduleValues[session.id] ?? {
                startAt: toWibDateTimeInput(session.startAt),
                reason: "",
              };
              const nextStart = fromWibDateTimeInput(edit.startAt);
              const duration =
                new Date(session.endAt).getTime() -
                new Date(session.startAt).getTime();
              const nextEnd = nextStart
                ? new Date(nextStart.getTime() + duration)
                : null;
              return (
                <div key={session.id} className="grid gap-4 sm:grid-cols-2">
                  <div className="flex min-w-0 items-start gap-3">
                    <IconBox variant="tertiary" size="md" aria-hidden="true">
                      <IconCalendarTime />
                    </IconBox>
                    <div className="min-w-0">
                      <Text className="text-sm text-muted">Date & time</Text>
                      <div className="flex flex-wrap items-center gap-2">
                        <Text>
                          {new Intl.DateTimeFormat("en", {
                            dateStyle: "medium",
                            timeStyle: "short",
                            timeZone: "Asia/Jakarta",
                          }).format(new Date(session.startAt))}{" "}
                          WIB
                        </Text>
                        <ClassActionReason
                          label="Update session time"
                          onOpen={() =>
                            setRescheduleValues((current) => {
                              const next = { ...current };
                              delete next[session.id];
                              return next;
                            })
                          }
                          reasonLabel="Reason for students"
                          disabled={rescheduleSession.isPending}
                          confirmDisabled={
                            !nextStart ||
                            !nextEnd ||
                            nextStart.getTime() ===
                              new Date(session.startAt).getTime()
                          }
                          trigger={
                            <Button
                              type="button"
                              variant="plain"
                              size="xs-icon"
                              disabled={rescheduleSession.isPending}
                              aria-label={`Change session time for ${session.titleEn}`}
                            >
                              <IconCalendarTime />
                            </Button>
                          }
                          onConfirm={(reason) =>
                            nextStart && nextEnd
                              ? rescheduleSession.mutateAsync({
                                  sessionId: session.id,
                                  expectedVersion: session.version,
                                  startAt: nextStart.toISOString(),
                                  endAt: nextEnd.toISOString(),
                                  reason,
                                })
                              : Promise.reject(
                                  new Error("Invalid session time"),
                                )
                          }
                        >
                          <Field>
                            <FieldLabel htmlFor={`reschedule-${session.id}`}>
                              New date and start time
                            </FieldLabel>
                            <CrossBrowserDateTimeInput
                              id={`reschedule-${session.id}`}
                              value={edit.startAt}
                              min={toWibDateTimeInput(new Date())}
                              onChange={(startAt) =>
                                setRescheduleValues((current) => ({
                                  ...current,
                                  [session.id]: { ...edit, startAt },
                                }))
                              }
                              disabled={rescheduleSession.isPending}
                            />
                            <FieldDescription>
                              Duration, tutor, room, mode, and class fee stay
                              the same.
                            </FieldDescription>
                          </Field>
                        </ClassActionReason>
                      </div>
                    </div>
                  </div>
                  <div className="flex min-w-0 items-start gap-3">
                    <IconBox variant="tertiary" size="md" aria-hidden="true">
                      <IconUser />
                    </IconBox>
                    <div className="min-w-0">
                      <Text className="text-sm text-muted">Tutor</Text>
                      <div className="flex flex-wrap items-center gap-2">
                        <Text>
                          {session.tutor?.name ?? "Current tutor"}
                          {session.tutorAbsence ? " · Absence reported" : ""}
                        </Text>
                        <ClassActionReason
                          label="Replace tutor"
                          onOpen={() =>
                            setReplacementTutorIds((current) => {
                              const next = { ...current };
                              delete next[session.id];
                              return next;
                            })
                          }
                          reasonLabel="Admin reason"
                          disabled={replaceAbsentTutor.isPending}
                          confirmDisabled={!replacementTutorIds[session.id]}
                          trigger={
                            <Button
                              type="button"
                              variant="plain"
                              size="xs-icon"
                              disabled={replaceAbsentTutor.isPending}
                              aria-label={`Change tutor for ${session.titleEn}`}
                            >
                              <IconArrowsExchange />
                            </Button>
                          }
                          onConfirm={(reason) =>
                            replaceAbsentTutor.mutateAsync({
                              sessionId: session.id,
                              expectedVersion: session.version,
                              replacementTutorId:
                                replacementTutorIds[session.id]!,
                              reason,
                            })
                          }
                        >
                          <Field>
                            <FieldLabel htmlFor={`replacement-${session.id}`}>
                              Replacement tutor
                            </FieldLabel>
                            <Select
                              value={replacementTutorIds[session.id] ?? ""}
                              onValueChange={(value) =>
                                setReplacementTutorIds((current) => ({
                                  ...current,
                                  [session.id]: String(value ?? ""),
                                }))
                              }
                              items={tutors
                                .filter(
                                  (tutor) => tutor.userId !== session.tutorId,
                                )
                                .map((tutor) => ({
                                  value: tutor.userId,
                                  label: tutor.user.name,
                                }))}
                            >
                              <SelectTrigger id={`replacement-${session.id}`}>
                                <SelectValue placeholder="Choose a published tutor" />
                              </SelectTrigger>
                              <SelectPopup>
                                <SelectList>
                                  {tutors
                                    .filter(
                                      (tutor) =>
                                        tutor.userId !== session.tutorId,
                                    )
                                    .map((tutor) => (
                                      <SelectItem
                                        key={tutor.userId}
                                        value={tutor.userId}
                                      >
                                        {tutor.user.name}
                                      </SelectItem>
                                    ))}
                                </SelectList>
                              </SelectPopup>
                            </Select>
                            <FieldDescription>
                              Session time, fee, and student allocations stay
                              the same.
                            </FieldDescription>
                          </Field>
                        </ClassActionReason>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
        {sessionOnly && absenceNotices.length > 0 ? (
          <section
            className="mt-4 space-y-2"
            aria-label="Tutor absence notices"
          >
            <Heading level={3} size="sm">
              Tutor absence history ({absenceNotices.length})
            </Heading>
            {absenceNotices.map(({ session, notice }) => (
              <div
                key={notice.id}
                className="rounded-md border border-warning-border bg-warning/10 p-3 text-sm"
              >
                <Text className="font-medium">
                  {session.titleEn} · {notice.tutor.name ?? "Tutor"}
                  {notice.late ? " · Late notice" : ""}
                </Text>
                <Text className="text-muted">
                  Reported{" "}
                  {new Intl.DateTimeFormat("en", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "Asia/Jakarta",
                  }).format(new Date(notice.reportedAt))}{" "}
                  WIB · {notice.reason} · {notice.tutorLateNoticeCount} late
                  notice(s) for this tutor
                </Text>
              </div>
            ))}
          </section>
        ) : null}
        {sessionOnly && (
          <ClassAdminLifecyclePanel
            classRecord={record}
            onChanged={onChanged}
            sessionOnly
          />
        )}
      </div>
    </section>
  );
}
