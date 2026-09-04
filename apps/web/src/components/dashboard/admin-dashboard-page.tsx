"use client";

import { useQuery } from "@tanstack/react-query";
import {
  IconAlertTriangle,
  IconCertificate,
  IconUserCheck,
} from "@tabler/icons-react";
import { Card, CardBody } from "@cogito-app/ui/components/selia/card";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { IconBox } from "@cogito-app/ui/components/selia/icon-box";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import { Text } from "@cogito-app/ui/components/selia/text";
import { lazy, Suspense } from "react";

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
  const achievementStats = useQuery(
    orpc.achievement.adminStats.queryOptions({ input: undefined }),
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
  const achievementCount = achievementStats.data?.pending ?? 0;
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
          value={achievementStats.isPending ? "—" : String(achievementCount)}
          tone="info-subtle"
        />
      </div>

      <Suspense fallback={<AnalyticsLoading />}>
        <AdminAnalytics />
      </Suspense>
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
