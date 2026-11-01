"use client";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { IconCalendarEvent, IconSchool } from "@tabler/icons-react";
import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Button } from "@cogito-app/ui/components/selia/button";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@cogito-app/ui/components/selia/table";
import { Text, TextLink } from "@cogito-app/ui/components/selia/text";

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
import { orpc } from "@/utils/orpc";

const kindLabels = {
  cohort: "Cohort",
  masterclass: "Masterclass",
} as const;

export function MyClassesPage() {
  const now = useNow();
  const classesQuery = useQuery(
    orpc.classes.listSessionReports.queryOptions({ input: {} }),
  );

  if (classesQuery.isPending) return <Loader />;

  const sessions = (classesQuery.data ?? []).toSorted((left, right) => {
    const leftUpcoming = classSessionStart(left.startAt) >= now;
    const rightUpcoming = classSessionStart(right.startAt) >= now;
    if (leftUpcoming !== rightUpcoming) return leftUpcoming ? -1 : 1;
    return leftUpcoming
      ? classSessionStart(left.startAt) - classSessionStart(right.startAt)
      : classSessionStart(right.startAt) - classSessionStart(left.startAt);
  });
  const upcomingCount = sessions.filter(
    (row) => classSessionStart(row.startAt) >= now && row.state !== "cancelled",
  ).length;

  return (
    <Stack direction="column" spacing="md">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Heading level={1} size="md">
            My classes
          </Heading>
          <Text className="max-w-full text-muted">
            Cohort and masterclass sessions assigned to you by Cogito.
          </Text>
        </div>
        <Button
          variant="secondary"
          nativeButton={false}
          render={
            <Link to="/class-reports" aria-label="Open session reports" />
          }
        >
          Session reports
        </Button>
      </div>

      {classesQuery.isError ? (
        <EmptyStateCard
          icon={<IconSchool />}
          tone="danger"
          title="Classes could not be loaded"
          description="Try loading your assigned classes again."
          action={
            <Button
              variant="secondary"
              onClick={() => void classesQuery.refetch()}
            >
              Try again
            </Button>
          }
        />
      ) : sessions.length === 0 ? (
        <EmptyStateCard
          icon={<IconSchool />}
          title="No classes assigned yet"
          description="When Cogito assigns you to a cohort or masterclass session, it will appear here."
        />
      ) : (
        <>
          <Text className="text-sm text-muted">
            {upcomingCount} upcoming · {sessions.length} total sessions
          </Text>
          <TableContainer>
            <Table aria-label="My class sessions" className="min-w-[720px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Class / session</TableHead>
                  <TableHead>Date · WIB</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Format</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((row) => {
                  const status = getClassSessionStatus(row, now);
                  const canReport =
                    row.state === "scheduled" &&
                    classSessionStart(row.startAt) <= now;
                  return (
                    <TableRow key={row.sessionId}>
                      <TableCell>
                        <TextLink
                          render={
                            <Link
                              to="/my-classes/$classId"
                              params={{ classId: row.classId }}
                              aria-label={`Open ${row.classTitle} details`}
                            />
                          }
                          className="font-medium"
                        >
                          {row.classTitle}
                        </TextLink>
                        <Text className="text-sm text-muted">
                          {classSessionReference(row)} · {row.sessionTitle}
                        </Text>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Text>{formatClassSessionDate(row.startAt)}</Text>
                        <Text className="text-sm text-muted">
                          {formatClassSessionTime(row.startAt)}–
                          {formatClassSessionTime(row.endAt)}
                        </Text>
                      </TableCell>
                      <TableCell>{kindLabels[row.classKind]}</TableCell>
                      <TableCell>
                        {row.mode === "online" ? "Online" : "In person"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {row.report || canReport ? (
                          <Button
                            variant="underline"
                            size="sm"
                            nativeButton={false}
                            render={
                              <Link
                                to="/class-reports"
                                search={{ report: `class:${row.sessionId}` }}
                                aria-label={`${row.report ? "View" : "Record"} report for ${row.classTitle} session ${row.sequenceNumber}`}
                              />
                            }
                          >
                            {row.report ? "View report" : "Record report"}
                          </Button>
                        ) : (
                          <Button
                            variant="underline"
                            size="sm"
                            nativeButton={false}
                            render={
                              <Link
                                to="/my-classes/$classId"
                                params={{ classId: row.classId }}
                                aria-label={`View ${row.classTitle} details`}
                              />
                            }
                          >
                            View class
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}

      <div className="flex items-center gap-2">
        <IconCalendarEvent className="size-4 text-muted" aria-hidden="true" />
        <Text className="text-sm text-muted">
          Times use Asia/Jakarta. Contact Cogito if a session is missing.
        </Text>
      </div>
    </Stack>
  );
}
