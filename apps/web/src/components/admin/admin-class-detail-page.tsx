"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { IconDeviceLaptop, IconMapPin, IconUsers } from "@tabler/icons-react";
import { IconBox } from "@cogito-app/ui/components/selia/icon-box";
import { Link } from "@tanstack/react-router";
import { Button } from "@cogito-app/ui/components/selia/button";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { Text } from "@cogito-app/ui/components/selia/text";
import Loader from "@/components/loader";
import {
  ClassDetailView,
  SessionJoinDetails,
} from "@/components/content/class-detail-page";
import { ClassAdminCancellationPanel } from "./class-admin-cancellation-panel";
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
              className="grid gap-4 sm:grid-cols-2"
            >
              <div className="flex min-w-0 items-start gap-3">
                <IconBox variant="tertiary" size="md" aria-hidden="true">
                  <IconUsers />
                </IconBox>
                <div className="min-w-0">
                  <Text className="text-sm text-muted">Capacity</Text>
                  <Text>{session.capacity} students</Text>
                </div>
              </div>
              <div className="flex min-w-0 items-start gap-3">
                <IconBox variant="tertiary" size="md" aria-hidden="true">
                  {session.mode === "online" ? (
                    <IconDeviceLaptop />
                  ) : (
                    <IconMapPin />
                  )}
                </IconBox>
                <div className="min-w-0 space-y-1">
                  <Text className="text-sm text-muted">
                    {session.mode === "online" ? "Meeting" : "Location"}
                  </Text>
                  <SessionJoinDetails
                    mode={session.mode === "in_person" ? "in_person" : "online"}
                    state={
                      session.state === "completed"
                        ? "completed"
                        : session.state === "cancelled"
                          ? "cancelled"
                          : "scheduled"
                    }
                    meetingUrl={session.meeting?.meetingUrl ?? null}
                    meetingStatus={session.meeting?.status ?? null}
                    roomName={session.room?.name ?? null}
                    roomLocation={session.room?.location ?? null}
                  />
                </div>
              </div>
            </div>,
          ]),
        )
      }
      adminTutorFeeIdr={record.tutorFeeIdr}
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
