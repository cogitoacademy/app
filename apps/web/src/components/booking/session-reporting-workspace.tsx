"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CogitoUser } from "@cogito-app/auth";
import { IconFileText } from "@tabler/icons-react";
import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Button } from "@cogito-app/ui/components/selia/button";
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
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/utils/orpc";
import { ClassSessionReportEditor } from "./class-session-report-editor";
import {
  PrivateSessionReportEditor,
  type PrivateReportSession,
} from "./private-session-report-editor";

type Session = {
  id: string;
  reference: string;
  title: string;
  type: "private" | "cohort" | "masterclass";
  startAt: Date;
  endAt: Date;
  recorded: boolean;
  canRecord: boolean;
  canEdit: boolean;
} & (
  | { source: "class"; sessionId: string }
  | { source: "private"; session: PrivateReportSession }
);
const PAGE_SIZE = 10;
const typeLabels = {
  private: "Private",
  cohort: "Cohort",
  masterclass: "Masterclass",
};
const dateLabel = (date: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(new Date(date));

export function SessionReportingWorkspace({
  showHeading = true,
  initialReportId,
}: {
  showHeading?: boolean;
  initialReportId?: string;
}) {
  const auth = authClient.useSession();
  const isAdmin = (auth.data?.user as CogitoUser | undefined)?.role === "admin";
  const classes = useQuery(
    orpc.classes.listSessionReports.queryOptions({ input: {} }),
  );
  const privateSessions = useQuery(
    orpc.booking.listReportSessions.queryOptions({ input: {} }),
  );
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | undefined>(
    initialReportId,
  );
  const [snapshot, setSnapshot] = useState<Session | null>(null);
  const [open, setOpen] = useState(Boolean(initialReportId));
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(false);
  const [editorGeneration, setEditorGeneration] = useState(0);
  const sessions = useMemo<Session[]>(
    () =>
      [
        ...(classes.data ?? [])
          .filter(
            (row) =>
              new Date(row.startAt).getTime() <= classes.dataUpdatedAt &&
              (row.report !== null || row.state === "scheduled"),
          )
          .map((row): Session => ({
            id: `class:${row.sessionId}`,
            reference: `CLS-${row.classNumber}-S${row.sequenceNumber}`,
            title: `${row.classTitle} · ${row.sessionTitle}`,
            type: row.classKind,
            startAt: row.startAt,
            endAt: row.endAt,
            recorded: Boolean(row.report),
            canRecord: !row.report && row.state === "scheduled",
            canEdit: Boolean(row.report && row.state === "completed"),
            source: "class",
            sessionId: row.sessionId,
          })),
        ...(privateSessions.data ?? []).map((row): Session => ({
          id: row.id,
          reference: row.reference,
          title: row.title,
          type: "private",
          startAt: row.startAt,
          endAt: row.endAt,
          recorded: Boolean(row.reportId),
          canRecord: row.canRecord,
          canEdit: row.canEdit,
          source: "private",
          session: row,
        })),
      ].toSorted(
        (left, right) =>
          new Date(right.startAt).getTime() -
            new Date(left.startAt).getTime() || left.id.localeCompare(right.id),
      ),
    [classes.data, classes.dataUpdatedAt, privateSessions.data],
  );
  const visible = sessions.filter(
    (session) =>
      (typeFilter === "all" || session.type === typeFilter) &&
      (status === "all" || session.recorded === (status === "recorded")) &&
      `${session.reference} ${session.title}`
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
  );
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const selected =
    sessions.find((session) => session.id === selectedId) ?? snapshot;
  const hasFilters = Boolean(
    search || typeFilter !== "all" || status !== "all",
  );

  function allowDiscard() {
    if (pending) return false;
    if (dirty && !window.confirm("Discard the unsaved report draft?"))
      return false;
    if (dirty) setEditorGeneration((value) => value + 1);
    setDirty(false);
    return true;
  }
  function view(session: Session) {
    if (!allowDiscard()) return;
    setSelectedId(session.id);
    setSnapshot(session);
    setOpen(true);
  }
  function clearFilters() {
    setSearch("");
    setTypeFilter("all");
    setStatus("all");
    setPage(0);
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
            Follow up on each delivered session
          </Heading>
          <Text className="max-w-full text-muted">
            Record feedback for private bookings, cohorts and masterclasses.
            Recorded private reports can be corrected by an administrator.
          </Text>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(0);
          }}
          aria-label="Search sessions by reference or title"
          placeholder="Search BKG / CLS reference or session"
          className="min-w-0 flex-1 basis-64"
        />
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
            aria-label="Filter session type"
            className="w-fit whitespace-nowrap"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectPopup>
            <SelectList>
              <SelectItem value="all">All types</SelectItem>
              {Object.entries(typeLabels).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectList>
          </SelectPopup>
        </Select>
        <Select
          value={status}
          onValueChange={(value) => {
            if (typeof value === "string") {
              setStatus(value);
              setPage(0);
            }
          }}
        >
          <SelectTrigger
            aria-label="Filter session report status"
            className="w-fit whitespace-nowrap"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectPopup>
            <SelectList>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="recorded">Recorded</SelectItem>
            </SelectList>
          </SelectPopup>
        </Select>
        {hasFilters ? (
          <Button variant="plain" onClick={clearFilters}>
            Clear filters
          </Button>
        ) : null}
      </div>
      {classes.isPending || privateSessions.isPending ? (
        <Loader />
      ) : classes.isError || privateSessions.isError ? (
        <EmptyState
          icon={<IconFileText />}
          title="Sessions unavailable"
          description="Could not load all reportable sessions. Try again."
          action={
            <Button
              variant="secondary"
              onClick={() => {
                void classes.refetch();
                void privateSessions.refetch();
              }}
            >
              Try again
            </Button>
          }
          className="rounded-lg border border-dashed border-border"
        />
      ) : !visible.length ? (
        <EmptyState
          icon={<IconFileText />}
          title={
            hasFilters ? "No matching sessions" : "No past sessions to review"
          }
          description={
            hasFilters
              ? "Try a different reference or clear the filters."
              : "Past private bookings and class sessions will appear here when they are available for reporting."
          }
          action={
            hasFilters ? (
              <Button variant="plain" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : undefined
          }
          className="rounded-lg border border-dashed border-border"
        />
      ) : (
        <>
          <TableContainer>
            <Table
              aria-label="Sessions for reporting"
              className="min-w-[640px]"
            >
              <TableHeader>
                <TableRow>
                  <TableHead>Session / reference</TableHead>
                  <TableHead>Date · WIB</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Report</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible
                  .slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)
                  .map((session) => (
                    <TableRow
                      key={session.id}
                      data-testid={`session-report-row-${session.source === "class" ? session.sessionId : session.id}`}
                    >
                      <TableCell>
                        <Text className="font-medium">{session.title}</Text>
                        <Text className="text-sm text-muted">
                          {session.reference}
                        </Text>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {dateLabel(session.startAt)}
                      </TableCell>
                      <TableCell>{typeLabels[session.type]}</TableCell>
                      <TableCell>
                        <Badge
                          variant={session.recorded ? "success" : "warning"}
                        >
                          {session.recorded ? "Recorded" : "Pending"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="plain"
                          size="sm"
                          onClick={() => view(session)}
                          aria-label={`${session.canEdit ? "Edit report" : session.canRecord ? "Record report" : "View report"}: ${session.reference}`}
                        >
                          {session.canEdit
                            ? "Edit report"
                            : session.canRecord
                              ? "Record report"
                              : "View report"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </TableContainer>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Text className="text-sm text-muted" role="status">
              {visible.length} sessions · All times in WIB
            </Text>
            <div className="flex items-center gap-2">
              <Button
                variant="plain"
                size="sm"
                disabled={!currentPage}
                onClick={() => setPage(currentPage - 1)}
              >
                Previous
              </Button>
              <Text className="text-sm text-muted">
                {currentPage + 1} / {pageCount}
              </Text>
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
      <Drawer
        open={open}
        onOpenChange={(next) => {
          if (next || allowDiscard()) setOpen(next);
        }}
      >
        <DrawerPopup direction="right">
          <DrawerHeader>
            <div>
              <DrawerTitle>{selected?.title ?? "Session report"}</DrawerTitle>
              <DrawerDescription>
                {selected?.reference ?? "Loading session"}
              </DrawerDescription>
            </div>
          </DrawerHeader>
          <DrawerBody>
            {selected ? (
              selected.source === "class" ? (
                <ClassSessionReportEditor
                  key={`${selected.id}:${editorGeneration}`}
                  sessionId={selected.sessionId}
                  onDirtyChange={setDirty}
                  onPendingChange={setPending}
                />
              ) : (
                <PrivateSessionReportEditor
                  key={`${selected.id}:${editorGeneration}`}
                  session={selected.session}
                  isAdmin={isAdmin}
                  onDirtyChange={setDirty}
                  onPendingChange={setPending}
                />
              )
            ) : classes.isPending || privateSessions.isPending ? (
              <Loader />
            ) : (
              <Text role="status">
                This session is not available for reporting.
              </Text>
            )}
          </DrawerBody>
          <DrawerFooter>
            <DrawerClose disabled={pending}>Close</DrawerClose>
          </DrawerFooter>
        </DrawerPopup>
      </Drawer>
    </Stack>
  );
}
