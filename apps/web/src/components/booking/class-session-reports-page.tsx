"use client";

import { useMemo, useState } from "react";
import { ORPCError } from "@orpc/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CogitoUser } from "@cogito-app/auth";
import { completionFeedbackInput } from "@cogito-app/api/modules/booking/booking.types";
import { listClassSessionReportsOutput } from "@cogito-app/api/modules/class-enrollment/class-enrollment.types";
import { Button } from "@cogito-app/ui/components/selia/button";
import { Badge } from "@cogito-app/ui/components/selia/badge";
import {
  Card,
  CardBody,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import { Checkbox } from "@cogito-app/ui/components/selia/checkbox";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@cogito-app/ui/components/selia/field";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { Input } from "@cogito-app/ui/components/selia/input";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import { Text } from "@cogito-app/ui/components/selia/text";
import { toastManager } from "@cogito-app/ui/components/selia/toast";
import {
  IconCalendarEvent,
  IconFileText,
  IconRefresh,
} from "@tabler/icons-react";
import { SessionCompletionFeedbackCard } from "@/components/booking/session-completion-feedback-card";
import { SessionFeedbackBulletInput } from "@/components/booking/session-feedback-bullet-input";
import type { CompletionFeedbackDraft } from "@/components/booking/complete-session-dialog";
import Loader from "@/components/loader";
import { getUserFacingError } from "@/lib/error-message";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";
import type { z } from "zod";

type FeedbackField = keyof CompletionFeedbackDraft;

type ReportDraft = {
  feedback: CompletionFeedbackDraft;
  deliveryConfirmed: boolean;
  adminReason: string;
};

const feedbackFields: {
  key: FeedbackField;
  label: string;
  description: string;
  placeholder: string;
}[] = [
  {
    key: "discussion",
    label: "Session discussion",
    description: "Topics, activities, and key takeaways covered.",
    placeholder: "e.g. Reviewed the structure of a persuasive opening",
  },
  {
    key: "strengths",
    label: "Strengths observed",
    description: "Progress, skills, or habits the student demonstrated.",
    placeholder: "e.g. Supported each claim with a relevant example",
  },
  {
    key: "improvements",
    label: "Areas for improvement",
    description: "Specific focus areas for the next session.",
    placeholder: "e.g. Practise concise rebuttals under time pressure",
  },
];

function emptyFeedback(): CompletionFeedbackDraft {
  return { discussion: [""], strengths: [""], improvements: [""] };
}

function createDraft(row: ReportRow): ReportDraft {
  return {
    feedback: row.report
      ? {
          discussion: row.report.discussion,
          strengths: row.report.strengths,
          improvements: row.report.improvements,
        }
      : emptyFeedback(),
    deliveryConfirmed: false,
    adminReason: "",
  };
}

function formatSessionDate(date: Date | string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(date));
}

function formatRupiah(amount: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function isConflict(error: unknown) {
  return error instanceof ORPCError && error.code === "CONFLICT";
}

type ReportRow = z.infer<typeof listClassSessionReportsOutput>[number];

export function ClassSessionReportsPage() {
  const queryClient = useQueryClient();
  const auth = authClient.useSession();
  const role = (auth.data?.user as CogitoUser | undefined)?.role;
  const isStudent = role === "student";
  const isAdmin = role === "admin";
  const reportsQuery = useQuery(
    orpc.classes.listSessionReports.queryOptions({ input: {} }),
  );
  const currentTime = reportsQuery.dataUpdatedAt;
  const submitReport = useMutation(
    orpc.classes.submitSessionReport.mutationOptions(),
  );
  const rows = useMemo(() => {
    const allRows = reportsQuery.data ?? [];
    const pastRows = isStudent
      ? allRows
      : allRows.filter(
          (row) =>
            new Date(row.endAt).getTime() <= currentTime &&
            (row.report !== null || row.state === "scheduled"),
        );
    return pastRows.toSorted(
      (left, right) =>
        new Date(right.startAt).getTime() - new Date(left.startAt).getTime(),
    );
  }, [currentTime, isStudent, reportsQuery.data]);

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null,
  );
  const [drafts, setDrafts] = useState<Record<string, ReportDraft>>({});
  const [baseVersions, setBaseVersions] = useState<Record<string, number>>({});
  const [requestKeys, setRequestKeys] = useState<Record<string, string>>({});
  const [conflictedSessions, setConflictedSessions] = useState<
    Record<string, boolean>
  >({});
  const [attemptedSessionId, setAttemptedSessionId] = useState<string | null>(
    null,
  );

  if (reportsQuery.isPending) return <Loader />;

  const selectedSessionIdResolved = selectedSessionId ?? rows[0]?.sessionId;
  const selectedRow = rows.find(
    (row) => row.sessionId === selectedSessionIdResolved,
  );
  const activeDraft = selectedRow
    ? (drafts[selectedRow.sessionId] ?? createDraft(selectedRow))
    : null;
  const expectedVersion = selectedRow
    ? (baseVersions[selectedRow.sessionId] ?? selectedRow.report?.version ?? 0)
    : 0;
  const feedbackResult = activeDraft
    ? completionFeedbackInput.safeParse(activeDraft.feedback)
    : null;
  const attempted = selectedRow?.sessionId === attemptedSessionId;
  const adminReasonLength = activeDraft
    ? Array.from(activeDraft.adminReason.trim()).length
    : 0;
  const reportCanBeSubmitted = Boolean(
    selectedRow &&
    new Date(selectedRow.endAt).getTime() <= currentTime &&
    ((selectedRow.state === "scheduled" && expectedVersion === 0) ||
      (selectedRow.state === "completed" && expectedVersion > 0)),
  );

  function selectRow(row: ReportRow) {
    setSelectedSessionId(row.sessionId);
    setDrafts((current) => ({
      ...current,
      [row.sessionId]: current[row.sessionId] ?? createDraft(row),
    }));
    setBaseVersions((current) => ({
      ...current,
      [row.sessionId]: current[row.sessionId] ?? row.report?.version ?? 0,
    }));
  }

  function updateDraft(row: ReportRow, updates: Partial<ReportDraft>) {
    setDrafts((current) => ({
      ...current,
      [row.sessionId]: {
        ...(current[row.sessionId] ?? createDraft(row)),
        ...updates,
      },
    }));
    setRequestKeys((current) => {
      const next = { ...current };
      delete next[row.sessionId];
      return next;
    });
    setAttemptedSessionId(null);
  }

  function feedbackError(field: FeedbackField) {
    if (!attempted || !feedbackResult || feedbackResult.success) return null;
    return (
      feedbackResult.error.issues.find((issue) => issue.path[0] === field)
        ?.message ?? null
    );
  }

  async function saveReport() {
    if (!selectedRow || !activeDraft) return;
    setAttemptedSessionId(selectedRow.sessionId);
    if (!feedbackResult?.success) return;
    if (!reportCanBeSubmitted) return;
    if (!activeDraft.deliveryConfirmed) return;
    if (isAdmin && (adminReasonLength < 3 || adminReasonLength > 500)) {
      return;
    }

    const requestKey =
      requestKeys[selectedRow.sessionId] ?? crypto.randomUUID();
    setRequestKeys((current) => ({
      ...current,
      [selectedRow.sessionId]: requestKey,
    }));
    const input = {
      classId: selectedRow.classId,
      sessionId: selectedRow.sessionId,
      expectedVersion,
      requestKey,
      deliveryConfirmed: true as const,
      feedback: feedbackResult.data,
      ...(isAdmin ? { adminReason: activeDraft.adminReason.trim() } : {}),
    };

    try {
      const saved = await submitReport.mutateAsync(input);
      setBaseVersions((current) => ({
        ...current,
        [selectedRow.sessionId]: saved.version,
      }));
      setDrafts((current) => ({
        ...current,
        [selectedRow.sessionId]: {
          ...(current[selectedRow.sessionId] ?? activeDraft),
          feedback: {
            discussion: saved.discussion,
            strengths: saved.strengths,
            improvements: saved.improvements,
          },
          deliveryConfirmed: false,
          adminReason: "",
        },
      }));
      setRequestKeys((current) => {
        const next = { ...current };
        delete next[selectedRow.sessionId];
        return next;
      });
      setConflictedSessions((current) => ({
        ...current,
        [selectedRow.sessionId]: false,
      }));
      setAttemptedSessionId(null);
      await queryClient.invalidateQueries({
        queryKey: orpc.classes.listSessionReports.key(),
      });
      toastManager.add({
        title: expectedVersion === 0 ? "Report recorded" : "Report updated",
        description:
          expectedVersion === 0
            ? "The session settlement is recorded with the report."
            : "The report text was updated. Settlement was not repeated.",
        type: "success",
      });
    } catch (error) {
      if (isConflict(error)) {
        await reportsQuery.refetch();
        setConflictedSessions((current) => ({
          ...current,
          [selectedRow.sessionId]: true,
        }));
        return;
      }
      toastManager.add({
        title: "Report could not be saved",
        description: getUserFacingError(error),
        type: "error",
      });
    }
  }

  function useLatestVersion() {
    if (!selectedRow?.report) return;
    setBaseVersions((current) => ({
      ...current,
      [selectedRow.sessionId]: selectedRow.report!.version,
    }));
    setRequestKeys((current) => {
      const next = { ...current };
      delete next[selectedRow.sessionId];
      return next;
    });
    setConflictedSessions((current) => ({
      ...current,
      [selectedRow.sessionId]: false,
    }));
  }

  if (reportsQuery.isError) {
    return (
      <Card className="mx-auto w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Reports are unavailable</CardTitle>
          <CardDescription>
            The private session report list could not be loaded.
          </CardDescription>
        </CardHeader>
        <CardBody>
          <Button
            variant="secondary"
            onClick={() => void reportsQuery.refetch()}
            progress={reportsQuery.isFetching}
          >
            <IconRefresh />
            Try again
          </Button>
        </CardBody>
      </Card>
    );
  }

  return (
    <Stack direction="column" spacing="lg" className="w-full min-w-0 pb-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-muted">
            <IconFileText aria-hidden="true" className="size-4" />
            <Text className="text-xs font-medium uppercase tracking-wider">
              Private class records
            </Text>
          </div>
          <Heading level={1}>Session reports</Heading>
          <Text className="mt-2 max-w-2xl text-muted">
            {isStudent
              ? "Reports for your eligible delivered sessions, including sessions retained in class history."
              : isAdmin
                ? "Review delivered class sessions, record missing reports, and make on-demand text corrections."
                : "Record feedback for your delivered class sessions and review reports you submitted."}
          </Text>
        </div>
        <Badge variant="info" className="gap-2">
          <IconCalendarEvent aria-hidden="true" />
          {rows.length} session{rows.length === 1 ? "" : "s"}
        </Badge>
      </div>

      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(17rem,0.85fr)_minmax(0,1.4fr)]">
        <section aria-label="Class sessions" className="min-w-0 space-y-3">
          {rows.length === 0 ? (
            <Card>
              <CardBody className="space-y-2 py-7">
                <Text className="font-medium">
                  {isStudent ? "No reports yet" : "No past sessions to review"}
                </Text>
                <Text className="text-sm text-muted">
                  {isStudent
                    ? "Your eligible session reports will appear here after a tutor records them."
                    : "Sessions awaiting a report will appear here after their scheduled end time."}
                </Text>
              </CardBody>
            </Card>
          ) : (
            rows.map((row) => {
              const selected = row.sessionId === selectedSessionIdResolved;
              const status = row.report ? "Report recorded" : "Report pending";
              return (
                <Card
                  key={row.sessionId}
                  data-testid={`session-report-row-${row.sessionId}`}
                  className={selected ? "ring-2 ring-primary" : undefined}
                >
                  <CardHeader className="items-start! gap-3">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={row.report ? "success" : "warning"}>
                          {status}
                        </Badge>
                        <Badge variant="secondary">
                          {row.classKind === "cohort"
                            ? "Cohort"
                            : "Masterclass"}
                        </Badge>
                      </div>
                      <CardTitle className="break-words">
                        {row.classTitle}
                      </CardTitle>
                      <CardDescription>
                        Session {row.sequenceNumber} · {row.sessionTitle}
                      </CardDescription>
                      <Text className="text-xs text-muted">
                        {formatSessionDate(row.startAt)}
                      </Text>
                    </div>
                  </CardHeader>
                  <CardBody className="flex items-center justify-between gap-3 pt-0">
                    <Badge variant="secondary-outline">
                      {row.mode === "online" ? "Online" : "In person"}
                    </Badge>
                    <Button
                      variant="plain"
                      size="sm"
                      aria-pressed={selected}
                      onClick={() => selectRow(row)}
                    >
                      {isStudent
                        ? "View report"
                        : selected
                          ? "Selected"
                          : "Open session"}
                    </Button>
                  </CardBody>
                </Card>
              );
            })
          )}
        </section>

        <section
          aria-label={
            isStudent
              ? "Selected session report"
              : "Selected session report editor"
          }
          className="min-w-0 space-y-4"
        >
          {!selectedRow || !activeDraft ? (
            <Card>
              <CardBody className="py-8">
                <Text className="text-muted">
                  Select a session to open its private report.
                </Text>
              </CardBody>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <div className="min-w-0">
                    <CardTitle level={2}>{selectedRow.classTitle}</CardTitle>
                    <CardDescription className="mt-2">
                      {selectedRow.classKind === "cohort"
                        ? "Cohort"
                        : "Masterclass"}
                      {" · "}Session {selectedRow.sequenceNumber}:{" "}
                      {selectedRow.sessionTitle}
                    </CardDescription>
                  </div>
                  <Badge variant="secondary-outline">
                    {selectedRow.mode === "online" ? "Online" : "In person"}
                  </Badge>
                </CardHeader>
                <CardBody className="space-y-4">
                  <div className="grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <Text className="text-xs font-medium uppercase tracking-wide text-dimmed">
                        Starts
                      </Text>
                      <Text className="mt-1">
                        {formatSessionDate(selectedRow.startAt)}
                      </Text>
                    </div>
                    <div>
                      <Text className="text-xs font-medium uppercase tracking-wide text-dimmed">
                        Ends
                      </Text>
                      <Text className="mt-1">
                        {formatSessionDate(selectedRow.endAt)}
                      </Text>
                    </div>
                  </div>

                  {selectedRow.report ? (
                    <SessionCompletionFeedbackCard
                      feedbacks={[
                        {
                          id: selectedRow.report.id,
                          sessionId: selectedRow.sessionId,
                          discussion: selectedRow.report.discussion,
                          strengths: selectedRow.report.strengths,
                          improvements: selectedRow.report.improvements,
                          createdAt: selectedRow.report.updatedAt,
                        },
                      ]}
                    />
                  ) : null}
                </CardBody>
              </Card>

              {!isStudent && selectedRow.settlement ? (
                <Card className="border-l-4 border-l-primary">
                  <CardBody className="space-y-2 py-4">
                    <Text className="font-medium">
                      {selectedRow.settlement.settled
                        ? "Recorded settlement"
                        : "Current settlement preview"}
                    </Text>
                    <Text className="text-sm">
                      {selectedRow.settlement.deductedMarks} Marks deducted
                      {" · "}
                      Tutor fee{" "}
                      {formatRupiah(selectedRow.settlement.tutorFeeIdr)}
                    </Text>
                    <Text className="text-sm text-muted">
                      {selectedRow.settlement.settled
                        ? "An edit changes report text and version only. It does not deduct Marks again or create another tutor fee."
                        : "If the first report is saved now, the server will apply these amounts atomically from currently funded session allocations."}
                    </Text>
                  </CardBody>
                </Card>
              ) : null}

              {conflictedSessions[selectedRow.sessionId] &&
              selectedRow.report ? (
                <Card className="border-warning-border bg-warning/10">
                  <CardBody className="space-y-3 py-4">
                    <div>
                      <Text className="font-medium">
                        A newer report version was loaded
                      </Text>
                      <Text className="mt-1 text-sm text-muted">
                        Your draft is still in the editor. Review the report
                        above, then explicitly choose whether to replace it.
                      </Text>
                    </div>
                    <Button variant="secondary" onClick={useLatestVersion}>
                      Use my draft over version {selectedRow.report.version}
                    </Button>
                  </CardBody>
                </Card>
              ) : null}

              {!isStudent ? (
                <Card>
                  <CardHeader>
                    <div>
                      <CardTitle level={2}>
                        {expectedVersion > 0
                          ? "Correct report text"
                          : "Record session report"}
                      </CardTitle>
                      <CardDescription className="mt-2">
                        Three feedback fields are saved with the delivery
                        confirmation.
                      </CardDescription>
                    </div>
                    {expectedVersion > 0 ? (
                      <Badge variant="info">Version {expectedVersion}</Badge>
                    ) : null}
                  </CardHeader>
                  <CardBody className="space-y-5">
                    {reportCanBeSubmitted ? (
                      <>
                        {feedbackFields.map((field) => {
                          const id = `class-report-${field.key}-${selectedRow.sessionId}`;
                          const error = feedbackError(field.key);
                          return (
                            <Field key={field.key}>
                              <FieldLabel
                                htmlFor={id}
                                className="font-semibold"
                              >
                                {field.label}
                              </FieldLabel>
                              <FieldDescription>
                                {field.description}
                              </FieldDescription>
                              <SessionFeedbackBulletInput
                                inputId={id}
                                ariaLabel={field.label}
                                placeholder={field.placeholder}
                                value={activeDraft.feedback[field.key]}
                                onChange={(value) => {
                                  const currentDraft =
                                    drafts[selectedRow.sessionId] ??
                                    activeDraft;
                                  updateDraft(selectedRow, {
                                    feedback: {
                                      ...currentDraft.feedback,
                                      [field.key]: value,
                                    },
                                  });
                                }}
                                disabled={submitReport.isPending}
                              />
                              {error ? (
                                <Text
                                  className="text-sm text-danger"
                                  role="alert"
                                >
                                  {error}
                                </Text>
                              ) : null}
                            </Field>
                          );
                        })}

                        {isAdmin ? (
                          <Field>
                            <FieldLabel
                              htmlFor={`class-report-admin-reason-${selectedRow.sessionId}`}
                              className="font-semibold"
                            >
                              Correction reason
                            </FieldLabel>
                            <FieldDescription>
                              Required for every report recorded or corrected by
                              an admin (3–500 characters).
                            </FieldDescription>
                            <Input
                              id={`class-report-admin-reason-${selectedRow.sessionId}`}
                              value={activeDraft.adminReason}
                              onChange={(event) =>
                                updateDraft(selectedRow, {
                                  adminReason: event.target.value,
                                })
                              }
                              aria-invalid={
                                attempted &&
                                (adminReasonLength < 3 ||
                                  adminReasonLength > 500)
                              }
                              disabled={submitReport.isPending}
                            />
                            <Text
                              className="text-xs text-dimmed"
                              aria-live="polite"
                            >
                              {adminReasonLength}/500 characters
                            </Text>
                            {attempted && adminReasonLength < 3 ? (
                              <Text
                                className="text-sm text-danger"
                                role="alert"
                              >
                                Enter a reason with at least 3 characters.
                              </Text>
                            ) : null}
                            {attempted && adminReasonLength > 500 ? (
                              <Text
                                className="text-sm text-danger"
                                role="alert"
                              >
                                Keep the reason within 500 characters.
                              </Text>
                            ) : null}
                          </Field>
                        ) : null}

                        <Field className="rounded-lg border border-item-border bg-item p-4">
                          <div className="flex items-start gap-3">
                            <Checkbox
                              id={`class-report-delivery-${selectedRow.sessionId}`}
                              checked={activeDraft.deliveryConfirmed}
                              onCheckedChange={(checked) =>
                                updateDraft(selectedRow, {
                                  deliveryConfirmed: checked === true,
                                })
                              }
                              disabled={submitReport.isPending}
                              aria-invalid={
                                attempted && !activeDraft.deliveryConfirmed
                              }
                              aria-labelledby={`class-report-delivery-label-${selectedRow.sessionId}`}
                            />
                            <div className="space-y-1">
                              <FieldLabel
                                id={`class-report-delivery-label-${selectedRow.sessionId}`}
                                htmlFor={`class-report-delivery-${selectedRow.sessionId}`}
                                className="font-medium"
                              >
                                I confirm this session was delivered.
                              </FieldLabel>
                              <FieldDescription>
                                A report cannot be submitted before the
                                scheduled end time.
                              </FieldDescription>
                            </div>
                          </div>
                          {attempted && !activeDraft.deliveryConfirmed ? (
                            <Text className="text-sm text-danger" role="alert">
                              Confirm delivery before saving this report.
                            </Text>
                          ) : null}
                        </Field>

                        {attempted && !feedbackResult?.success ? (
                          <Text className="text-sm text-danger" role="alert">
                            Complete all three feedback fields and keep each
                            field within its 600-character limit.
                          </Text>
                        ) : null}

                        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                          <Text className="max-w-xl text-xs text-muted">
                            Saving a correction updates report text and audit
                            history. It does not repeat session settlement.
                          </Text>
                          <Button
                            onClick={() => void saveReport()}
                            disabled={
                              submitReport.isPending || !reportCanBeSubmitted
                            }
                            progress={submitReport.isPending}
                          >
                            {submitReport.isPending
                              ? "Saving report"
                              : expectedVersion > 0
                                ? "Save correction"
                                : "Record report"}
                          </Button>
                        </div>
                        {!reportCanBeSubmitted ? (
                          <Text className="text-sm text-muted">
                            This session is not in a state that accepts a
                            report.
                          </Text>
                        ) : null}
                      </>
                    ) : (
                      <Text className="text-sm text-muted">
                        Report fields are available after the scheduled session
                        ends.
                      </Text>
                    )}
                  </CardBody>
                </Card>
              ) : null}
            </>
          )}
        </section>
      </div>
    </Stack>
  );
}
