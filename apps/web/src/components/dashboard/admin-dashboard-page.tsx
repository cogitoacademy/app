"use client";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  IconAlertTriangle,
  IconArrowRight,
  IconCertificate,
  IconShieldCheck,
  IconUserCheck,
} from "@tabler/icons-react";
import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Card,
  CardBody,
  CardHeader,
  CardHeaderAction,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { IconBox } from "@cogito-app/ui/components/selia/icon-box";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import { Text } from "@cogito-app/ui/components/selia/text";
import { lazy, Suspense } from "react";

import {
  formatBookingDate,
  getBookingStateLabel,
  getBookingStateVariant,
} from "@/components/booking/booking-ui";
import { EmptyState } from "@/components/empty-state";
import { orpc } from "@/utils/orpc";

const AdminAnalytics = lazy(() =>
  import("./admin-analytics").then(({ AdminAnalytics: Component }) => ({
    default: Component,
  })),
);

export function AdminDashboardPage({ adminName }: { adminName: string }) {
  const bookingQueue = useQuery(
    orpc.adminBooking.listBookings.queryOptions({ input: { limit: 20 } }),
  );
  const escalations = useQuery(
    orpc.adminBooking.listBookings.queryOptions({
      input: { limit: 20, escalated: true },
    }),
  );
  const tutors = useQuery(
    orpc.adminTutor.listTutorProfiles.queryOptions({
      input: { status: "pending_review", limit: 20, offset: 0 },
    }),
  );
  const achievements = useQuery(
    orpc.achievement.adminList.queryOptions({
      input: { status: "pending", limit: 20, offset: 0 },
    }),
  );
  const firstName = adminName.trim().split(/\s+/)[0] || "Admin";
  const urgentBookings = (bookingQueue.data?.items ?? []).filter(
    (item) =>
      item.escalated ||
      [
        "awaiting_admin_room_approval",
        "payment_failed",
        "refund_failed",
      ].includes(item.currentState),
  );
  const priorityItems = [
    ...(escalations.data?.items ?? []),
    ...urgentBookings,
  ].filter(
    (item, index, items) =>
      items.findIndex((candidate) => candidate.id === item.id) === index,
  );
  const tutorCount = tutors.data?.length ?? 0;
  const achievementCount = achievements.data?.length ?? 0;
  return (
    <Stack direction="column" spacing="lg">
      <div>
        <Heading className="text-3xl">Good to see you, {firstName}</Heading>
        <Text className="mt-2 max-w-2xl text-muted">
          Clear time-sensitive operations first, then move through tutor and
          achievement reviews.
        </Text>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Metric
          icon={<IconAlertTriangle />}
          label="Escalated operations"
          value={escalations.isPending ? "—" : String(priorityItems.length)}
          tone={priorityItems.length ? "danger-subtle" : "tertiary-subtle"}
        />
        <Metric
          icon={<IconUserCheck />}
          label="Tutor reviews"
          value={tutors.isPending ? "—" : String(tutorCount)}
          tone="warning-subtle"
        />
        <Metric
          icon={<IconCertificate />}
          label="Achievement reviews"
          value={achievements.isPending ? "—" : String(achievementCount)}
          tone="info-subtle"
        />
      </div>

      <Suspense fallback={<AnalyticsLoading />}>
        <AdminAnalytics />
      </Suspense>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
        <Card>
          <CardHeader className="py-3">
            <CardTitle>Priority operations</CardTitle>
            <CardHeaderAction>
              <Button
                variant="plain"
                size="sm"
                nativeButton={false}
                render={
                  <Link
                    to="/admin-operations"
                    aria-label="Open admin operations queue"
                  />
                }
              >
                Open queue <IconArrowRight />
              </Button>
            </CardHeaderAction>
          </CardHeader>
          <CardBody>
            {bookingQueue.isPending || escalations.isPending ? (
              <div className="h-32 animate-pulse rounded-lg bg-accent" />
            ) : priorityItems.length ? (
              <Stack direction="column" spacing="sm" className="m-0!">
                {priorityItems.slice(0, 4).map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col gap-3 rounded-lg border border-item-border bg-item p-4 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Text className="font-mono text-xs">{item.id}</Text>
                        <Badge
                          variant={getBookingStateVariant(item.currentState)}
                          pill
                        >
                          {getBookingStateLabel(item.currentState)}
                        </Badge>
                        {item.escalated ? (
                          <Badge variant="danger" pill>
                            Escalated
                          </Badge>
                        ) : null}
                      </div>
                      <Text className="mt-1 text-sm text-muted">
                        {formatBookingDate(
                          item.scheduledStartAt,
                          item.timezone,
                        )}{" "}
                        · {item.modality}
                      </Text>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      nativeButton={false}
                      render={
                        <Link
                          to="/admin-operations"
                          aria-label={`Investigate booking ${item.id}`}
                        />
                      }
                    >
                      Investigate <IconArrowRight />
                    </Button>
                  </div>
                ))}
              </Stack>
            ) : (
              <EmptyState
                icon={<IconShieldCheck />}
                title="Priority queue is clear"
                description="New escalations and booking exceptions will appear here."
                tone="success"
                size="compact"
                className="rounded-lg"
              />
            )}
          </CardBody>
        </Card>
      </div>
    </Stack>
  );
}

function AnalyticsLoading() {
  return (
    <div
      className="h-48 animate-pulse rounded-xl bg-accent"
      aria-label="Loading business insights"
    />
  );
}

function Metric({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone:
    | "danger-subtle"
    | "secondary-subtle"
    | "tertiary-subtle"
    | "warning-subtle"
    | "info-subtle";
}) {
  return (
    <Card>
      <CardBody className="flex items-center gap-4 p-3">
        <IconBox variant={tone}>{icon}</IconBox>
        <div>
          <Text className="text-sm text-muted">{label}</Text>
          <Heading size="sm">{value}</Heading>
        </div>
      </CardBody>
    </Card>
  );
}
