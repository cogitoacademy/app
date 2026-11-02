"use client";

import { useQuery } from "@tanstack/react-query";
import {
  IconAlertTriangle,
  IconClipboardCheck,
  IconTrophy,
  IconWallet,
} from "@tabler/icons-react";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import { lazy, Suspense, useState } from "react";

import Loader from "@/components/loader";
import { DashboardInsights } from "@/components/dashboard/dashboard-insights";
import { createDashboardGreeting } from "./dashboard-greetings";
import { useNow } from "@/hooks/use-now";
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
  const now = useNow(60_000);
  const [randomValue] = useState(() => Math.random());
  const greeting = createDashboardGreeting(
    "admin",
    adminName,
    new Date(now).getHours(),
    randomValue,
    { priorityCount: priorityItems.length + tutorCount + achievementCount },
  );
  return (
    <Stack direction="column" spacing="lg">
      <DashboardInsights
        title={greeting.title}
        description={greeting.description}
        items={[
          {
            key: "escalations",
            icon: <IconAlertTriangle />,
            label: "Escalated bookings",
            value: escalations.isPending
              ? "..."
              : (escalations.data?.items.length ?? 0),
            detail: "Support and booking cases needing review",
            tone: "danger-subtle",
            to: "/admin-operations",
            actionLabel: "Open escalated bookings",
          },
          {
            key: "urgent-bookings",
            icon: <IconAlertTriangle />,
            label: "Booking exceptions",
            value: bookingQueue.isPending ? "..." : urgentBookings.length,
            detail: "Room, payment, or refund states needing intervention",
            tone: "warning-subtle",
            to: "/admin-operations",
            actionLabel: "Open booking exceptions",
          },
          {
            key: "tutor-review",
            icon: <IconClipboardCheck />,
            label: "Tutor reviews",
            value: tutors.isPending ? "..." : tutorCount,
            detail: "Tutor profiles waiting for moderation",
            tone: "info-subtle",
            to: "/admin-tutors",
            actionLabel: "Open tutor reviews",
          },
          {
            key: "achievement-review",
            icon: <IconTrophy />,
            label: "Achievement reviews",
            value: achievementStats.isPending ? "..." : achievementCount,
            detail: "Student submissions waiting for moderation",
            tone: "primary-subtle",
            to: "/admin-achievements",
            actionLabel: "Open achievement reviews",
          },
          {
            key: "tutor-payouts",
            icon: <IconWallet />,
            label: "Tutor payouts",
            value: "Payouts",
            detail: "Verify accounts, review honorarium, and record transfers",
            tone: "primary-subtle",
            to: "/admin-tutor-payouts",
            actionLabel: "Open tutor payouts",
          },
        ]}
      />

      <Suspense fallback={<Loader />}>
        <AdminAnalytics />
      </Suspense>
    </Stack>
  );
}
