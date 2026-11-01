"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "@cogito-app/ui/components/selia/button";
import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { Text } from "@cogito-app/ui/components/selia/text";
import Loader from "@/components/loader";
import { ClassDetailView } from "@/components/content/class-detail-page";
import { ClassAdminCancellationPanel } from "./class-admin-cancellation-panel";
import { ClassAdminLifecyclePanel } from "./class-admin-lifecycle-panel";
import { ClassAdminManagement } from "./class-admin-management";
import { orpc } from "@/utils/orpc";

export function AdminClassDetailPage({ classId }: { classId: string }) {
  const queryClient = useQueryClient();
  const academyClass = useQuery(
    orpc.admin.getAcademyClass.queryOptions({ input: { id: classId } }),
  );
  async function refreshClass() {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: orpc.admin.getAcademyClass.key({ input: { id: classId } }),
      }),
      queryClient.invalidateQueries({
        queryKey: orpc.admin.listAcademyClasses.key(),
      }),
      queryClient.invalidateQueries({ queryKey: orpc.classes.key() }),
    ]);
  }
  if (academyClass.isPending) return <Loader />;
  if (academyClass.isError)
    return (
      <section className="space-y-3" role="alert">
        <Heading level={1} size="sm">
          Class details are unavailable
        </Heading>
        <Text>Try loading the class again or return to the class list.</Text>
        <Button variant="secondary" onClick={() => void academyClass.refetch()}>
          Try again
        </Button>
        <Button
          nativeButton={false}
          role="link"
          variant="underline"
          render={<Link to="/admin-classes" aria-label="All classes" />}
        >
          All classes
        </Button>
      </section>
    );
  const record = academyClass.data;
  const canManage = ["published", "postponed"].includes(record.state);
  return (
    <ClassDetailView
      item={record}
      badgeActions={
        canManage ? (
          <ClassAdminCancellationPanel
            classId={record.id}
            expectedVersion={record.version}
            onChanged={refreshClass}
          />
        ) : null
      }
      sessionActions={
        new Map(
          record.sessions.map((session) => [
            session.id,
            canManage ? (
              <ClassAdminManagement
                key={`session-actions-${session.id}`}
                record={{ ...record, sessions: [session] }}
                onChanged={refreshClass}
                sessionOnly
              />
            ) : null,
          ]),
        )
      }
      sessionDetails={
        new Map(
          record.sessions.map((session) => [
            session.id,
            <div
              key={`session-details-${session.id}`}
              className="space-y-2 border-t border-border pt-3"
            >
              <Text className="text-sm">
                Status: {session.state} · Capacity: {session.capacity}
              </Text>
              {session.mode === "online" ? (
                <Text className="text-sm">
                  Meeting: {session.meeting?.status ?? "pending"}
                </Text>
              ) : (
                <Text className="text-sm">
                  Room: {session.room?.name ?? "Not assigned"}
                </Text>
              )}
              {session.meeting?.meetingUrl ? (
                <Button
                  size="sm"
                  variant="underline"
                  nativeButton={false}
                  role="link"
                  render={
                    <a
                      href={session.meeting.meetingUrl}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Open meeting for ${session.titleEn}`}
                    />
                  }
                >
                  Open meeting
                </Button>
              ) : null}
            </div>,
          ]),
        )
      }
      adminSummary={
        <section className="space-y-4 border-t border-border pt-4 xl:border-t-0 xl:border-l xl:pl-6 xl:pt-0">
          <Heading level={2} size="sm">
            Administration
          </Heading>
          <Badge
            variant={record.state === "published" ? "success" : "secondary"}
          >
            {record.state}
          </Badge>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted">Tutor fee per session</dt>
            <dd>
              {new Intl.NumberFormat("id-ID", {
                style: "currency",
                currency: "IDR",
                maximumFractionDigits: 0,
              }).format(record.tutorFeeIdr)}
            </dd>
            <dt className="text-muted">Sessions</dt>
            <dd>{record.sessions.length}</dd>
          </dl>
          {canManage && (
            <ClassAdminLifecyclePanel
              classRecord={record}
              onChanged={refreshClass}
              minimumOnly
            />
          )}
        </section>
      }
      adminControls={
        canManage ? (
          <ClassAdminManagement
            key={classId}
            record={record}
            onChanged={refreshClass}
          />
        ) : (
          <section id="class-management">
            <Text>
              Class management is unavailable while this class is {record.state}
              .
            </Text>
          </section>
        )
      }
    />
  );
}
