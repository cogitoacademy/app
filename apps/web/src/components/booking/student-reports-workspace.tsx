"use client";

/* oxlint-disable react/no-array-index-key -- Read-only report bullets have stable positions. */

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { IconDownload, IconFileText } from "@tabler/icons-react";
import { Button } from "@cogito-app/ui/components/selia/button";
import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Checkbox } from "@cogito-app/ui/components/selia/checkbox";
import {
  Drawer,
  DrawerPopup,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerBody,
  DrawerFooter,
  DrawerClose,
} from "@cogito-app/ui/components/selia/drawer";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { Input } from "@cogito-app/ui/components/selia/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectPopup,
  SelectList,
  SelectItem,
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
import { EmptyState } from "@/components/empty-state";
import Loader from "@/components/loader";
import { getUserFacingError } from "@/lib/error-message";
import { serverUrl } from "@/lib/server-url";
import { orpc } from "@/utils/orpc";

type Student = { id: string; name: string; email: string };
type Report = {
  id: string;
  reference: string;
  title: string;
  type: "private" | "cohort" | "masterclass";
  scheduledStartAt: string;
  metadata: { label: string; value: string }[];
  sections: { label: string; bullets: string[] }[];
};
type ReportList = {
  studentName: string;
  generatedAt: string;
  periodStart: string;
  reports: Report[];
};
const PAGE_SIZE = 10;
const NO_REPORTS: Report[] = [];
const typeNames = {
  private: "Private",
  cohort: "Cohort",
  masterclass: "Masterclass",
};
const dateLabel = (date: string) =>
  new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(date));

export function StudentReportsWorkspace({
  isAdmin,
  currentUserId,
  showHeading = true,
}: {
  isAdmin: boolean;
  currentUserId: string;
  showHeading?: boolean;
}) {
  const [student, setStudent] = useState<Student | null>(null);
  const studentId = isAdmin ? student?.id : currentUserId;
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [days, setDays] = useState("all");
  const [page, setPage] = useState(0);
  const [selection, setSelection] = useState<string[]>([]);
  const [openedReport, setOpenedReport] = useState<Report | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setDebouncedSearch(search.trim()),
      250,
    );
    return () => window.clearTimeout(timer);
  }, [search]);

  const students = useQuery({
    ...orpc.admin.searchUsers.queryOptions({
      input: { query: debouncedSearch || "--", limit: 10, role: "student" },
    }),
    enabled: isAdmin && !studentId && debouncedSearch.length >= 2,
  });
  const list = useQuery({
    queryKey: ["student-report-list", studentId],
    queryFn: async () => {
      const response = await fetch(`${serverUrl}/reports/student/list`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isAdmin ? { studentId } : {}),
      });
      if (!response.ok)
        throw new Error("Could not load student reports. Try again.");
      return (await response.json()) as ReportList;
    },
    enabled: Boolean(studentId),
  });
  const reports = list.data?.reports ?? NO_REPORTS;
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const cutoff =
      days === "all"
        ? 0
        : new Date(list.data?.generatedAt ?? 0).getTime() -
          Number(days) * 86_400_000;
    return reports.filter(
      (report) =>
        (typeFilter === "all" || report.type === typeFilter) &&
        new Date(report.scheduledStartAt).getTime() >= cutoff &&
        (!query ||
          `${report.reference} ${report.title} ${report.metadata.map((item) => item.value).join(" ")}`
            .toLowerCase()
            .includes(query)),
    );
  }, [reports, search, typeFilter, days, list.data?.generatedAt]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageReports = filtered.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE,
  );
  const selectedIds = selection.filter((id) =>
    reports.some((report) => report.id === id),
  );
  const pageSelected = pageReports.filter((report) =>
    selectedIds.includes(report.id),
  ).length;
  const hasFilters = Boolean(search || typeFilter !== "all" || days !== "all");

  function resetFilters() {
    setSearch("");
    setTypeFilter("all");
    setDays("all");
    setPage(0);
  }
  function chooseStudent(next: Student | null) {
    setStudent(next);
    resetFilters();
    setDebouncedSearch("");
    setSelection([]);
    setOpenedReport(null);
    setReportOpen(false);
    setDownloadError(null);
  }
  async function downloadSelected() {
    if (!studentId || !selectedIds.length) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      const response = await fetch(`${serverUrl}/reports/student/pdf`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(isAdmin ? { studentId } : {}),
          reportIds: selectedIds,
        }),
      });
      if (response.status === 409 || response.status === 204) {
        await list.refetch();
        throw new Error(
          "Some selected reports are no longer available. Review your selection and try again.",
        );
      }
      if (!response.ok)
        throw new Error("Could not download the selected reports. Try again.");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `student-reports-${new Date().toISOString().slice(0, 10)}.pdf`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setDownloadError(getUserFacingError(error));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Stack
      direction="column"
      spacing="md"
      className="w-full min-w-0 flex-nowrap"
    >
      {showHeading ? (
        <div>
          <Heading level={1} size="md">
            Follow up on learning progress
          </Heading>
          <Text className="max-w-full text-muted">
            Review feedback and select up to 100 reports to combine into one
            PDF. Eligible reports cover the last three calendar months.
          </Text>
        </div>
      ) : null}
      {isAdmin && student ? (
        <div className="flex flex-wrap items-center gap-2">
          <Text className="font-medium">{student.name}</Text>
          <Text className="text-muted">{student.email}</Text>
          <Button
            variant="plain"
            size="sm"
            disabled={downloading}
            onClick={() => chooseStudent(null)}
          >
            Change student
          </Button>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1 basis-64">
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
            aria-label={
              studentId
                ? "Search reports by reference or session"
                : "Search students by name or email"
            }
            placeholder={
              studentId
                ? "Search reference, class, session or tutor"
                : "Search student name or email"
            }
          />
        </div>
        {studentId ? (
          <>
            <Select
              value={typeFilter}
              onValueChange={(value) => {
                if (typeof value === "string") {
                  setTypeFilter(value);
                  setPage(0);
                }
              }}
            >
              <SelectTrigger
                className="w-fit whitespace-nowrap"
                aria-label="Filter report type"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectPopup>
                <SelectList>
                  <SelectItem value="all">All types</SelectItem>
                  {Object.entries(typeNames).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectList>
              </SelectPopup>
            </Select>
            <Select
              value={days}
              onValueChange={(value) => {
                if (typeof value === "string") {
                  setDays(value);
                  setPage(0);
                }
              }}
            >
              <SelectTrigger
                className="w-fit whitespace-nowrap"
                aria-label="Filter report dates"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectPopup>
                <SelectList>
                  <SelectItem value="all">Eligible period</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                </SelectList>
              </SelectPopup>
            </Select>
            {hasFilters ? (
              <Button variant="plain" onClick={resetFilters}>
                Clear filters
              </Button>
            ) : null}
            <Button
              disabled={
                !selectedIds.length ||
                downloading ||
                list.isFetching ||
                list.isError
              }
              progress={downloading}
              onClick={() => void downloadSelected()}
            >
              <IconDownload aria-hidden="true" />
              {downloading
                ? "Preparing PDF"
                : `Download Selected (${selectedIds.length})`}
            </Button>
          </>
        ) : null}
      </div>
      {!studentId && debouncedSearch.length >= 2 ? (
        <div
          role="group"
          aria-label="Student search results"
          className="space-y-1"
        >
          {students.isFetching ? (
            <Text role="status">Searching students…</Text>
          ) : students.isError ? (
            <Text role="alert">
              Could not search students. Change your search or try again.
            </Text>
          ) : students.data?.length ? (
            students.data.map((candidate) => (
              <Button
                key={candidate.id}
                variant="plain"
                className="w-full justify-start"
                onClick={() => chooseStudent(candidate)}
              >
                {candidate.name} · {candidate.email}
              </Button>
            ))
          ) : (
            <Text role="status" className="text-muted">
              No students match this search.
            </Text>
          )}
        </div>
      ) : null}
      {downloadError ? (
        <Text role="alert" className="text-danger">
          {downloadError}
        </Text>
      ) : null}
      {!studentId ? (
        <EmptyState
          icon={<IconFileText />}
          title="Choose a student"
          description="Search above to review their reports and select a PDF download."
          className="rounded-lg border border-dashed border-border"
        />
      ) : list.isPending ? (
        <Loader />
      ) : list.isError ? (
        <EmptyState
          icon={<IconFileText />}
          title="Reports unavailable"
          description="The report list could not be loaded."
          action={
            <Button variant="secondary" onClick={() => void list.refetch()}>
              Try again
            </Button>
          }
          className="rounded-lg border border-dashed border-border"
        />
      ) : !filtered.length ? (
        <EmptyState
          icon={<IconFileText />}
          title={
            reports.length
              ? "No reports match these filters"
              : "No downloadable reports yet"
          }
          description={
            reports.length
              ? "Clear the filters to see all eligible reports."
              : "Submitted feedback appears here once the session and access requirements are met within the last three calendar months."
          }
          action={
            hasFilters ? (
              <Button variant="plain" onClick={resetFilters}>
                Clear filters
              </Button>
            ) : undefined
          }
          className="rounded-lg border border-dashed border-border"
        />
      ) : (
        <>
          <TableContainer>
            <Table aria-label="Student reports" className="min-w-[640px]">
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <Checkbox
                      aria-label="Select reports on this page"
                      checked={pageSelected === pageReports.length}
                      indeterminate={
                        pageSelected > 0 && pageSelected < pageReports.length
                      }
                      onCheckedChange={(checked) =>
                        setSelection(
                          checked
                            ? Array.from(
                                new Set([
                                  ...selectedIds,
                                  ...pageReports.map((report) => report.id),
                                ]),
                              ).slice(0, 100)
                            : selectedIds.filter(
                                (id) =>
                                  !pageReports.some(
                                    (report) => report.id === id,
                                  ),
                              ),
                        )
                      }
                    />
                  </TableHead>
                  <TableHead>Session / reference</TableHead>
                  <TableHead>Date · WIB</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageReports.map((report) => (
                  <TableRow
                    key={report.id}
                    aria-selected={selectedIds.includes(report.id)}
                  >
                    <TableCell>
                      <Checkbox
                        aria-label={`Select ${report.reference}: ${report.title}`}
                        checked={selectedIds.includes(report.id)}
                        disabled={
                          selectedIds.length >= 100 &&
                          !selectedIds.includes(report.id)
                        }
                        onCheckedChange={(checked) =>
                          setSelection(
                            checked
                              ? [...selectedIds, report.id]
                              : selectedIds.filter((id) => id !== report.id),
                          )
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <Text className="font-medium">{report.title}</Text>
                      <Text className="text-sm text-muted">
                        {report.reference}
                      </Text>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {dateLabel(report.scheduledStartAt)}
                    </TableCell>
                    <TableCell>{typeNames[report.type]}</TableCell>
                    <TableCell>
                      <Badge variant="success">Recorded</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="plain"
                        size="sm"
                        onClick={() => {
                          setOpenedReport(report);
                          setReportOpen(true);
                        }}
                        aria-label={`View ${report.reference}: ${report.title}`}
                      >
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Text role="status" className="text-sm text-muted">
                {selectedIds.length} reports selected · One PDF
              </Text>
              {selectedIds.length ? (
                <Button
                  variant="plain"
                  size="sm"
                  onClick={() => setSelection([])}
                >
                  Clear selection
                </Button>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <Text className="text-sm text-muted">
                {currentPage * PAGE_SIZE + 1}–
                {Math.min((currentPage + 1) * PAGE_SIZE, filtered.length)} of{" "}
                {filtered.length}
              </Text>
              <Button
                variant="plain"
                size="sm"
                disabled={currentPage === 0}
                onClick={() => setPage(currentPage - 1)}
              >
                Previous
              </Button>
              <Button
                variant="plain"
                size="sm"
                disabled={currentPage + 1 >= pageCount}
                onClick={() => setPage(currentPage + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
      <Drawer open={reportOpen} onOpenChange={setReportOpen}>
        <DrawerPopup direction="right">
          <DrawerHeader>
            <div>
              <DrawerTitle>
                {openedReport?.title ?? "Session report"}
              </DrawerTitle>
              <DrawerDescription>{openedReport?.reference}</DrawerDescription>
            </div>
          </DrawerHeader>
          <DrawerBody className="space-y-6">
            <dl className="grid grid-cols-2 gap-3">
              {openedReport?.metadata.map((item) => (
                <div key={item.label}>
                  <dt className="text-sm text-muted">{item.label}</dt>
                  <dd className="wrap-anywhere whitespace-pre-wrap">
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>
            {openedReport?.sections.map((section) => (
              <section key={section.label}>
                <Heading level={2} size="sm">
                  {section.label}
                </Heading>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {section.bullets.map((bullet, index) => (
                    <li
                      key={index}
                      className="wrap-anywhere whitespace-pre-wrap"
                    >
                      {bullet}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </DrawerBody>
          <DrawerFooter>
            <DrawerClose>Close</DrawerClose>
          </DrawerFooter>
        </DrawerPopup>
      </Drawer>
    </Stack>
  );
}
