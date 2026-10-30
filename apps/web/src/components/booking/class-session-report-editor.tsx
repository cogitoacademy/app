"use client";

import { useState } from "react";
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
import { Input } from "@cogito-app/ui/components/selia/input";

import { Text } from "@cogito-app/ui/components/selia/text";
import { toastManager } from "@cogito-app/ui/components/selia/toast";
import { IconRefresh } from "@tabler/icons-react";
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
export function ClassSessionReportEditor({
  sessionId,
  onDirtyChange,
  onPendingChange,
}: {
  sessionId: string;
  onDirtyChange: (dirty: boolean) => void;
  onPendingChange: (pending: boolean) => void;
}) {
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
  const reportAbsence = useMutation(orpc.admin.reportTutorAbsence.mutationOptions());
  const rows = reportsQuery.data ?? [];
  const [drafts, setDrafts] = useState<Record<string, ReportDraft>>({});
  const [baseVersions, setBaseVersions] = useState<Record<string, number>>({});
  const [requestKeys, setRequestKeys] = useState<Record<string, string>>({});
  const [conflictedSessions, setConflictedSessions] = useState<
    Record<string, boolean>
  >({});
  const [attemptedSessionId, setAttemptedSessionId] = useState<string | null>(
    null,
  );
  const [absenceReason, setAbsenceReason] = useState("");
  const [absenceRequestKeys, setAbsenceRequestKeys] = useState<Record<string, string>>({});

  if (reportsQuery.isPending) return <Loader />;
  const selectedRow = rows.find((row) => row.sessionId === sessionId);
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

  function updateDraft(row: ReportRow, updates: Partial<ReportDraft>) {
    onDirtyChange(true);
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

    onPendingChange(true);
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
      onDirtyChange(false);
      await queryClient.invalidateQueries({
        queryKey: orpc.classes.listSessionReports.key(),
      });
      await queryClient.invalidateQueries({
        queryKey: ["student-report-list"],
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
    } finally {
      onPendingChange(false);
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
    <section
      aria-label={
        isStudent ? "Selected session report" : "Selected session report editor"
      }
      className="min-w-0 scroll-mt-6 space-y-4 rounded-xl outline-none focus-visible:outline-2 focus-visible:outline-primary"
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
              {role === "tutor" && selectedRow.tutorId === auth.data?.user.id && selectedRow.state === "scheduled" && !selectedRow.absenceReportedAt ? (
                <form className="space-y-3 border-b border-border pb-4" onSubmit={async (event) => {
                  event.preventDefault();
                  const reason = absenceReason.trim();
                  if (reason.length < 3) return;
                  try {
                    const requestKey = absenceRequestKeys[selectedRow.sessionId] ?? crypto.randomUUID();
                    setAbsenceRequestKeys((current) => ({ ...current, [selectedRow.sessionId]: requestKey }));
                    await reportAbsence.mutateAsync({ sessionId: selectedRow.sessionId, requestKey, reason });
                    setAbsenceReason("");
                    setAbsenceRequestKeys((current) => { const next = { ...current }; delete next[selectedRow.sessionId]; return next; });
                    await queryClient.invalidateQueries({ queryKey: orpc.classes.listSessionReports.key() });
                    toastManager.add({ title: "Absence notice recorded", type: "success" });
                  } catch (error) {
                    toastManager.add({ title: "Absence notice could not be recorded", description: getUserFacingError(error), type: "error" });
                  }
                }}>
                  <Text className="font-medium">Report tutor absence</Text>
                  <Field>
                    <FieldLabel htmlFor={`absence-reason-${selectedRow.sessionId}`}>Reason</FieldLabel>
                    <Input id={`absence-reason-${selectedRow.sessionId}`} value={absenceReason} onChange={(event) => setAbsenceReason(event.target.value)} maxLength={1000} required />
                    <FieldDescription>Submitted notices include the server time. Notices within 24 hours of session start are marked late.</FieldDescription>
                  </Field>
                  <Button type="submit" variant="secondary" disabled={absenceReason.trim().length < 3 || reportAbsence.isPending}>Report absence</Button>
                </form>
              ) : selectedRow.absenceReportedAt ? (
                <div className="space-y-1 border-b border-border pb-4" role="status">
                  <Text className="font-medium">Tutor absence notice recorded{selectedRow.absenceLate ? " · Late notice" : ""}</Text>
                  <Text className="text-muted">{formatSessionDate(selectedRow.absenceReportedAt)}</Text>
                </div>
              ) : null}
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
                      version: selectedRow.report.version,
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
                  Tutor fee {formatRupiah(selectedRow.settlement.tutorFeeIdr)}
                </Text>
                <Text className="text-sm text-muted">
                  {selectedRow.settlement.settled
                    ? "An edit changes report text and version only. It does not deduct Marks again or create another tutor fee."
                    : "If the first report is saved now, the server will apply these amounts atomically from currently funded session allocations."}
                </Text>
              </CardBody>
            </Card>
          ) : null}

          {conflictedSessions[selectedRow.sessionId] && selectedRow.report ? (
            <Card className="border-warning-border bg-warning/10">
              <CardBody className="space-y-3 py-4">
                <div>
                  <Text className="font-medium">
                    A newer report version was loaded
                  </Text>
                  <Text className="mt-1 text-sm text-muted">
                    Your draft is still in the editor. Review the report above,
                    then explicitly choose whether to replace it.
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
                          <FieldLabel htmlFor={id} className="font-semibold">
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
                                drafts[selectedRow.sessionId] ?? activeDraft;
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
                            <Text className="text-sm text-danger" role="alert">
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
                          Required for every report recorded or corrected by an
                          admin (3–500 characters).
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
                            (adminReasonLength < 3 || adminReasonLength > 500)
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
                          <Text className="text-sm text-danger" role="alert">
                            Enter a reason with at least 3 characters.
                          </Text>
                        ) : null}
                        {attempted && adminReasonLength > 500 ? (
                          <Text className="text-sm text-danger" role="alert">
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
                            A report cannot be submitted before the scheduled
                            end time.
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
                        Complete all three feedback fields and keep each field
                        within its 600-character limit.
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
                        This session is not in a state that accepts a report.
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
  );
}
