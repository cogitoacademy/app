"use client";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { IconWallet } from "@tabler/icons-react";
import { Card, CardBody } from "@cogito-app/ui/components/selia/card";
import { Button } from "@cogito-app/ui/components/selia/button";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { IconBox } from "@cogito-app/ui/components/selia/icon-box";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import { Text } from "@cogito-app/ui/components/selia/text";
import { lazy, Suspense } from "react";

import Loader from "@/components/loader";
import { DashboardWelcomeCard } from "@/components/dashboard/dashboard-welcome-card";
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
  return (
    <Stack direction="column" spacing="lg">
      <div className="grid lg:grid-cols-2 gap-4">
        <DashboardWelcomeCard
          name={adminName}
          viewerRole="admin"
          priorityCount={priorityItems.length + tutorCount + achievementCount}
        />

        <Card>
          <CardBody className="flex flex-wrap h-full justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <IconBox variant="tertiary">
                <IconWallet />
              </IconBox>
              <div className="min-w-0">
                <Heading size="sm">Tutor payouts</Heading>
                <Text className="text-sm text-muted">
                  Verify accounts, review unpaid honorarium, and record
                  transfers.
                </Text>
              </div>
            </div>
            <Button
              size="sm"
              className="self-end"
              variant="secondary"
              nativeButton={false}
              render={
                <Link
                  to="/admin-tutor-payouts"
                  aria-label="Open tutor payouts"
                />
              }
            >
              Open payouts
            </Button>
          </CardBody>
        </Card>
      </div>

      <Suspense fallback={<Loader />}>
        <AdminAnalytics />
      </Suspense>
    </Stack>
  );
}
