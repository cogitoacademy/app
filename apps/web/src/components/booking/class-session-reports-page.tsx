"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  Select,
  SelectItem,
  SelectList,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@cogito-app/ui/components/selia/select";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import {
  Table,
  TableContainer,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@cogito-app/ui/components/selia/table";
import { Text } from "@cogito-app/ui/components/selia/text";
import { toastManager } from "@cogito-app/ui/components/selia/toast";
import {
  IconCalendarEvent,
  IconDownload,
  IconRefresh,
} from "@tabler/icons-react";
import { SessionCompletionFeedbackCard } from "@/components/booking/session-completion-feedback-card";
import { SessionFeedbackBulletInput } from "@/components/booking/session-feedback-bullet-input";
import { EmptyState } from "@/components/empty-state";
import type { CompletionFeedbackDraft } from "@/components/booking/complete-session-dialog";
import Loader from "@/components/loader";
import { getUserFacingError } from "@/lib/error-message";
import { authClient } from "@/lib/auth-client";
import { serverUrl } from "@/lib/server-url";
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
type ExportStudent = { id: string; name: string; email: string; role: string };
type ExportSummary = {
  reportCount: number;
  periodStart: string;
  generatedAt: string;
  timezone: "Asia/Jakarta";
};

export function ClassSessionReportsPage() {
  const queryClient = useQueryClient();
  const auth = authClient.useSession();
  const role = (auth.data?.user as CogitoUser | undefined)?.role;
  const isStudent = role === "student";
  const isAdmin = role === "admin";
  const currentUserId = (auth.data?.user as CogitoUser | undefined)?.id;
  const [exportStudent, setExportStudent] = useState<ExportStudent | null>(
    null,
  );
  const [studentSearch, setStudentSearch] = useState("");
  const [debouncedStudentSearch, setDebouncedStudentSearch] = useState("");
  const [downloadPending, setDownloadPending] = useState(false);
  const [downloadEmpty, setDownloadEmpty] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedStudentSearch(studentSearch.trim()),
      250,
    );
    return () => window.clearTimeout(timer);
  }, [studentSearch]);

  const exportStudentSearchQuery = useQuery({
    ...orpc.admin.searchUsers.queryOptions({
      input: {
        query: debouncedStudentSearch || "--",
        limit: 10,
        role: "student",
      },
    }),
    enabled: isAdmin && !exportStudent && debouncedStudentSearch.length >= 2,
  });
  const exportStudentOptions = (exportStudentSearchQuery.data ??
    []) as ExportStudent[];
  const exportStudentId = isStudent
    ? currentUserId
    : isAdmin
      ? exportStudent?.id
      : undefined;
  const exportSummaryQuery = useQuery({
    queryKey: ["student-report-pdf-summary", exportStudentId],
    queryFn: async () => {
      const response = await fetch(`${serverUrl}/reports/student/summary`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isAdmin ? { studentId: exportStudentId } : {}),
      });
      if (!response.ok) throw new Error("Could not check report eligibility.");
      return (await response.json()) as ExportSummary;
    },
    enabled: Boolean(exportStudentId),
    staleTime: 30_000,
  });
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
  const [sessionSearch, setSessionSearch] = useState("");
  const [classTypeFilter, setClassTypeFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [reportStatusFilter, setReportStatusFilter] = useState("all");
  const visibleRows = useMemo(() => {
    const query = sessionSearch.trim().toLowerCase();
    const dateBoundary =
      dateFilter === "all"
        ? null
        : currentTime - Number(dateFilter) * 24 * 60 * 60 * 1000;

    return rows.filter((row) => {
      const matchesQuery =
        !query ||
        `CLS-${row.classNumber} ${row.classNumber} ${row.classTitle} ${row.sessionTitle}`
          .toLowerCase()
          .includes(query);
      const matchesClassType =
        classTypeFilter === "all" || row.classKind === classTypeFilter;
      const matchesDate =
        dateBoundary === null ||
        new Date(row.startAt).getTime() >= dateBoundary;
      const matchesStatus =
        reportStatusFilter === "all" ||
        (reportStatusFilter === "recorded" ? row.report !== null : !row.report);
      return matchesQuery && matchesClassType && matchesDate && matchesStatus;
    });
  }, [
    classTypeFilter,
    currentTime,
    dateFilter,
    reportStatusFilter,
    rows,
    sessionSearch,
  ]);

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

  const reportPanelRef = useRef<HTMLElement>(null);

  if (reportsQuery.isPending) return <Loader />;

  const selectedSessionIdResolved = visibleRows.some(
    (row) => row.sessionId === selectedSessionId,
  )
    ? selectedSessionId
    : visibleRows[0]?.sessionId;
  const selectedRow = visibleRows.find(
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
    if (window.matchMedia("(max-width: 1023px)").matches) {
      requestAnimationFrame(() => {
        reportPanelRef.current?.focus({ preventScroll: true });
        reportPanelRef.current?.scrollIntoView({ block: "start" });
      });
    }
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
      await queryClient.invalidateQueries({
        queryKey: ["student-report-pdf-summary"],
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

  async function downloadStudentReports() {
    if (!exportStudentId) return;
    setDownloadPending(true);
    setDownloadEmpty(false);
    setDownloadError(null);
    try {
      const response = await fetch(`${serverUrl}/reports/student/pdf`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isAdmin ? { studentId: exportStudentId } : {}),
      });
      if (response.status === 204) {
        setDownloadEmpty(true);
        await exportSummaryQuery.refetch();
        return;
      }
      if (!response.ok) {
        throw new Error("Could not download this student report.");
      }
      const fileUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = fileUrl;
      anchor.download = `student-session-reports-${new Date().toISOString().slice(0, 10)}.pdf`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(fileUrl), 1000);
    } catch (error) {
      setDownloadError(
        getUserFacingError(error, "Could not download this student report."),
      );
    } finally {
      setDownloadPending(false);
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
    <Stack
      direction="column"
      spacing="md"
      className="w-full min-w-0 max-w-full flex-nowrap overflow-visible pb-8"
    >
      <div className="flex w-full min-w-0 max-w-full flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 max-w-full">
          <Heading level={1} size="md">
            Follow up on each delivered session
          </Heading>
          <Text className="max-w-full text-muted">
            {isStudent
              ? "Read your tutor's feedback after it is submitted."
              : isAdmin
                ? "Review delivered sessions; if a report is missing, record it or correct submitted text."
                : "Submit feedback for delivered sessions, then review your reports here."}
          </Text>
        </div>
        <Badge variant="info" className="gap-2">
          <IconCalendarEvent aria-hidden="true" />
          {visibleRows.length} session{visibleRows.length === 1 ? "" : "s"}
        </Badge>
      </div>

      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          value={sessionSearch}
          onChange={(event) => setSessionSearch(event.target.value)}
          placeholder="Search class or session"
          aria-label="Search class or session"
          className="w-full min-w-0 sm:w-auto sm:max-w-xs sm:flex-1"
        />
        <div className="flex min-w-0 flex-wrap items-center gap-2 sm:shrink-0">
          <Select
            value={classTypeFilter}
            onValueChange={(value) => {
              if (
                value === "all" ||
                value === "cohort" ||
                value === "masterclass"
              ) {
                setClassTypeFilter(value);
              }
            }}
          >
            <SelectTrigger
              aria-label="Filter by class type"
              className="w-fit min-w-max whitespace-nowrap"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectPopup>
              <SelectList>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="cohort">Cohort</SelectItem>
                <SelectItem value="masterclass">Masterclass</SelectItem>
              </SelectList>
            </SelectPopup>
          </Select>
          <Select
            value={dateFilter}
            onValueChange={(value) => {
              if (value === "all" || value === "30" || value === "90") {
                setDateFilter(value);
              }
            }}
          >
            <SelectTrigger
              aria-label="Filter by date"
              className="w-fit min-w-max whitespace-nowrap"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectPopup>
              <SelectList>
                <SelectItem value="all">Any date</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectList>
            </SelectPopup>
          </Select>
          <Select
            value={reportStatusFilter}
            onValueChange={(value) => {
              if (
                value === "all" ||
                value === "recorded" ||
                value === "pending"
              ) {
                setReportStatusFilter(value);
              }
            }}
          >
            <SelectTrigger
              aria-label="Filter by report status"
              className="w-fit min-w-max whitespace-nowrap"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectPopup>
              <SelectList>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="recorded">Report recorded</SelectItem>
                <SelectItem value="pending">Report pending</SelectItem>
              </SelectList>
            </SelectPopup>
          </Select>
          {sessionSearch ||
          classTypeFilter !== "all" ||
          dateFilter !== "all" ||
          reportStatusFilter !== "all" ? (
            <Button
              variant="plain"
              className="whitespace-nowrap"
              onClick={() => {
                setSessionSearch("");
                setClassTypeFilter("all");
                setDateFilter("all");
                setReportStatusFilter("all");
              }}
            >
              Clear filters
            </Button>
          ) : null}
        </div>
      </div>

      {isAdmin ||
      (isStudent &&
        (rows.length > 0 || Boolean(exportSummaryQuery.data?.reportCount))) ? (
        <Card>
          <CardHeader>
            <div>
              <CardTitle level={2}>Download reports</CardTitle>
              <CardDescription className="mt-2">
                Download eligible session feedback from the last three calendar
                months.
              </CardDescription>
            </div>
          </CardHeader>
          <CardBody className="space-y-4">
            {isAdmin && !exportStudent ? (
              <div className="max-w-xl space-y-3">
                <Field>
                  <FieldLabel htmlFor="report-export-student-search">
                    Choose a student
                  </FieldLabel>
                  <Input
                    id="report-export-student-search"
                    value={studentSearch}
                    onChange={(event) => setStudentSearch(event.target.value)}
                    placeholder="Search by student name or email"
                    autoComplete="off"
                  />
                </Field>
                {debouncedStudentSearch.length >= 2 ? (
                  <div
                    role="group"
                    aria-label="Student search results"
                    className="space-y-1 rounded-lg border border-border p-2"
                  >
                    {exportStudentSearchQuery.isFetching ? (
                      <Text className="p-2 text-sm text-muted" role="status">
                        Searching students…
                      </Text>
                    ) : exportStudentOptions.length ? (
                      exportStudentOptions.map((candidate) => (
                        <Button
                          key={candidate.id}
                          variant="plain"
                          className="w-full justify-start"
                          onClick={() => {
                            setExportStudent(candidate);
                            setStudentSearch("");
                            setDownloadEmpty(false);
                          }}
                        >
                          {candidate.name} · {candidate.email}
                        </Button>
                      ))
                    ) : (
                      <Text className="p-2 text-sm text-muted" role="status">
                        No students match that search.
                      </Text>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}

            {isAdmin && exportStudent ? (
              <div className="flex flex-wrap items-center gap-3">
                <Text className="font-medium">
                  {exportStudent.name} · {exportStudent.email}
                </Text>
                <Button
                  variant="plain"
                  size="sm"
                  onClick={() => {
                    setExportStudent(null);
                    setDownloadEmpty(false);
                    setDownloadError(null);
                  }}
                >
                  Change student
                </Button>
              </div>
            ) : null}

            {exportStudentId && exportSummaryQuery.isPending ? (
              <Text className="text-sm text-muted" role="status">
                Checking eligible reports…
              </Text>
            ) : null}
            {exportStudentId && exportSummaryQuery.isError ? (
              <div className="flex flex-wrap items-center gap-3">
                <Text className="text-sm text-danger" role="alert">
                  {getUserFacingError(
                    exportSummaryQuery.error,
                    "Could not check eligible reports.",
                  )}
                </Text>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void exportSummaryQuery.refetch()}
                >
                  Try again
                </Button>
              </div>
            ) : null}
            {exportSummaryQuery.data?.reportCount === 0 || downloadEmpty ? (
              <div className="space-y-1" role="status">
                <Text className="font-medium">
                  No eligible reports in the last three calendar months
                </Text>
                <Text className="text-sm text-muted">
                  Eligible reports will appear here once session feedback is
                  available.
                </Text>
              </div>
            ) : null}
            {exportSummaryQuery.data?.reportCount ? (
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="info">
                  {exportSummaryQuery.data.reportCount} eligible report
                  {exportSummaryQuery.data.reportCount === 1 ? "" : "s"}
                </Badge>
                <Button
                  onClick={() => void downloadStudentReports()}
                  disabled={downloadPending}
                  progress={downloadPending}
                >
                  <IconDownload aria-hidden="true" />
                  {downloadPending ? "Preparing PDF" : "Download PDF"}
                </Button>
              </div>
            ) : null}
            {downloadError ? (
              <Text className="text-sm text-danger" role="alert">
                {downloadError}
              </Text>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      <div className="grid min-w-0 gap-5">
        <section aria-label="Class sessions" className="min-w-0 space-y-3">
          {visibleRows.length > 0 ? (
            <Heading level={2} size="sm">
              Class sessions
            </Heading>
          ) : null}
          <div className="min-w-0">
            {visibleRows.length === 0 ? (
              <EmptyState
                icon={<IconCalendarEvent aria-hidden="true" />}
                title={
                  rows.length === 0
                    ? isStudent
                      ? "No reports yet"
                      : "No past sessions to review"
                    : "No matching sessions"
                }
                description={
                  rows.length === 0
                    ? isStudent
                      ? "After your session, your tutor’s feedback will appear here. You can read each report and download eligible reports as a PDF."
                      : "Sessions awaiting a report will appear here after their scheduled end time."
                    : "Try a different search or clear the filters to see more sessions."
                }
                className="min-h-72 rounded-lg border border-dashed border-border py-10"
              />
            ) : (
              <Card>
                <CardBody>
                  <TableContainer>
                    <Table
                      aria-label="Class sessions"
                      className="min-w-[760px]"
                    >
                      <TableHeader>
                        <TableRow>
                          <TableHead scope="col">Class / session</TableHead>
                          <TableHead scope="col">Date · Jakarta</TableHead>
                          <TableHead scope="col">Format</TableHead>
                          <TableHead scope="col">Report status</TableHead>
                          <TableHead scope="col" className="text-right">
                            Action
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visibleRows.map((row) => {
                          const selected =
                            row.sessionId === selectedSessionIdResolved;
                          return (
                            <TableRow
                              key={row.sessionId}
                              data-testid={`session-report-row-${row.sessionId}`}
                              aria-selected={selected}
                              className={selected ? "bg-accent" : undefined}
                            >
                              <TableCell>
                                <Text className="font-medium">
                                  {row.classTitle}
                                </Text>
                                <Text className="mt-1 text-sm text-muted">
                                  CLS-{row.classNumber} · Session{" "}
                                  {row.sequenceNumber} · {row.sessionTitle}
                                </Text>
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-sm">
                                {formatSessionDate(row.startAt)}
                              </TableCell>
                              <TableCell>
                                <Text className="text-sm">
                                  {row.classKind === "cohort"
                                    ? "Cohort"
                                    : "Masterclass"}
                                </Text>
                                <Text className="mt-1 text-sm text-muted">
                                  {row.mode === "online"
                                    ? "Online"
                                    : "In person"}
                                </Text>
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={row.report ? "success" : "warning"}
                                >
                                  {row.report
                                    ? "Report recorded"
                                    : "Report pending"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="plain"
                                  size="sm"
                                  aria-pressed={selected}
                                  aria-label={`${isStudent ? "View report" : "Open session"}: ${row.classTitle}, session ${row.sequenceNumber}`}
                                  onClick={() => selectRow(row)}
                                >
                                  {selected
                                    ? "Selected"
                                    : isStudent
                                      ? "View report"
                                      : "Open session"}
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </CardBody>
              </Card>
            )}
          </div>
        </section>

        <section
          ref={reportPanelRef}
          tabIndex={-1}
          aria-label={
            isStudent
              ? "Selected session report"
              : "Selected session report editor"
          }
          className="min-w-0 scroll-mt-6 space-y-4 rounded-xl outline-none focus-visible:outline-2 focus-visible:outline-primary"
        >
          {visibleRows.length === 0 ? null : !selectedRow || !activeDraft ? (
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
