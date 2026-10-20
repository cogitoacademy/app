"use client";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  IconAlertCircle,
  IconArrowRight,
  IconCalendarEvent,
  IconCircleCheck,
  IconClock,
  IconInbox,
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
import { TextLink } from "@cogito-app/ui/components/selia/text";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import { Text } from "@cogito-app/ui/components/selia/text";

import { EmptyState } from "@/components/empty-state";
import Loader from "@/components/loader";
import {
  isUpcomingBooking,
  NextLessonSection,
  type BookingCardData,
} from "@/components/booking/booking-card";
import { DashboardWelcomeCard } from "@/components/dashboard/dashboard-welcome-card";
import { DashboardInsights } from "@/components/dashboard/dashboard-insights";
import {
  formatBookingDate,
  getBookingStateLabel,
  getBookingStateVariant,
} from "@/components/booking/booking-ui";
import { useNow } from "@/hooks/use-now";
import {
  formatPayoutCoverageLabel,
  formatTaxRateSnapshot,
} from "@/lib/tutor-payout-presentation";
import { orpc } from "@/utils/orpc";

function formatIdr(value: number | null | undefined) {
  return value === null || value === undefined
    ? "—"
    : `Rp${value.toLocaleString("id-ID")}`;
}

function formatPayoutDate(value: Date | string | null) {
  if (!value) return "Not transferred";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeZone: "Asia/Jakarta",
  }).format(date);
}

function payoutStatusLabel(status: "prepared" | "paid" | "void") {
  if (status === "prepared") return "Prepared";
  if (status === "void") return "Void / reconciliation";
  return "Transfer recorded";
}

export function TutorDashboardPage({ tutorName }: { tutorName: string }) {
  const now = useNow();
  const bookings = useQuery(
    orpc.booking.listMine.queryOptions({ input: { limit: 100 } }),
  );
  const actionBookings = useQuery(
    orpc.booking.listMine.queryOptions({
      input: { limit: 100, view: "action" },
    }),
  );
  const payoutFinance = useQuery(orpc.tutor.getMyPayoutFinance.queryOptions());
  const availability = useQuery(orpc.tutor.listAvailability.queryOptions());

  const items = (bookings.data?.items ?? []) as BookingCardData[];
  const actionItems = (actionBookings.data?.items ?? []) as BookingCardData[];
  const upcoming = items
    .filter((booking) => isUpcomingBooking(booking, now))
    .toSorted(
      (a, b) =>
        new Date(a.scheduledStartAt).getTime() -
        new Date(b.scheduledStartAt).getTime(),
    );
  const nextBooking = upcoming[0];
  const nearestActionDeadline = actionItems
    .filter((booking) => booking.deadlineAt)
    .toSorted(
      (a, b) =>
        new Date(a.deadlineAt!).getTime() - new Date(b.deadlineAt!).getTime(),
    )[0];
  const pendingPayout = payoutFinance.data?.pending;
  const payoutHistory = payoutFinance.data?.history ?? [];

  return (
    <Stack direction="column" spacing="md">
      <div className="grid gap-4 lg:grid-cols-2">
        <DashboardWelcomeCard
          name={tutorName}
          viewerRole="tutor"
          actionCount={bookings.data?.counts.action ?? 0}
        />

        <NeedsActionCard
          isLoading={actionBookings.isPending}
          actionItems={actionItems}
        />
      </div>

      <DashboardInsights
        title="Teaching pulse"
        description="Keep requests, sessions, and schedule capacity moving."
        items={[
          {
            key: "action",
            icon: <IconAlertCircle />,
            label: "Needs action",
            value: bookings.isPending
              ? "..."
              : (bookings.data?.counts.action ?? 0),
            detail: nearestActionDeadline
              ? `Next deadline: ${formatBookingDate(nearestActionDeadline.deadlineAt!, nearestActionDeadline.timezone)}`
              : "Requests or completion steps waiting on you",
            tone: "warning-subtle",
            to: "/bookings",
            actionLabel: "Open bookings needing action",
          },
          {
            key: "upcoming",
            icon: <IconCalendarEvent />,
            label: "Upcoming sessions",
            value: bookings.isPending
              ? "..."
              : (bookings.data?.counts.upcoming ?? 0),
            detail: "Scheduled sessions on your teaching calendar",
            tone: "info-subtle",
            to: "/bookings",
            actionLabel: "Open upcoming bookings",
          },
          {
            key: "completed",
            icon: <IconCircleCheck />,
            label: "Completed sessions",
            value: bookings.isPending
              ? "..."
              : (bookings.data?.counts.completed ?? 0),
            detail: "Completed sessions visible in your history",
            tone: "success-subtle",
            to: "/bookings",
            actionLabel: "Open completed bookings",
          },
          {
            key: "availability",
            icon: <IconClock />,
            label: "Availability windows",
            value: availability.isPending
              ? "..."
              : (availability.data?.length ?? 0),
            detail: "Active windows open for student bookings",
            tone: "primary-subtle",
            to: "/availability",
            actionLabel: "Open availability",
          },
        ]}
      />

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader className="py-4">
            <CardTitle>Payout details</CardTitle>
            <CardHeaderAction>
              <TextLink
                render={
                  <Link to="/profile" aria-label="Review tax and bank profile">
                    Tax and bank profile
                  </Link>
                }
              />
            </CardHeaderAction>
          </CardHeader>
          <CardBody>
            {payoutFinance.isPending ? (
              <Loader />
            ) : payoutFinance.isError || !pendingPayout ? (
              <Text className="text-sm text-danger">
                Payout details could not be loaded. Refresh and try again.
              </Text>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <div>
                    <Text className="text-sm text-muted">Unpaid sessions</Text>
                    <Text className="mt-1 text-lg font-semibold">
                      {pendingPayout.completedSessions}
                    </Text>
                  </div>
                  <div>
                    <Text className="text-sm text-muted">Gross honorarium</Text>
                    <Text className="mt-1 text-lg font-semibold">
                      {formatIdr(pendingPayout.grossHonorariumIdr)}
                    </Text>
                  </div>
                  <div>
                    <Text className="text-sm text-muted">Tax rate</Text>
                    <Text className="mt-1 text-lg font-semibold">
                      {(pendingPayout.taxRateBps / 100).toFixed(2)}%
                    </Text>
                    <Text className="text-xs text-dimmed">
                      {pendingPayout.taxRateSource.replaceAll("_", " ")}
                    </Text>
                  </div>
                </div>
                <div className="mt-4 grid gap-2 rounded-lg bg-accent p-4 sm:grid-cols-2">
                  <div className="flex justify-between gap-3">
                    <Text className="text-sm text-muted">Tax withheld</Text>
                    <Text className="font-medium">
                      {formatIdr(pendingPayout.taxHonorariumIdr)}
                    </Text>
                  </div>
                  <div className="flex justify-between gap-3">
                    <Text className="text-sm text-muted">Transfer fee</Text>
                    <Text className="font-medium">
                      {formatIdr(pendingPayout.transferFeeIdr)}
                    </Text>
                  </div>
                  <div className="flex justify-between gap-3 sm:col-span-2 sm:border-t sm:border-border sm:pt-2">
                    <Text className="font-semibold">Estimated net payout</Text>
                    <Text className="font-semibold">
                      {formatIdr(pendingPayout.netHonorariumIdr)}
                    </Text>
                  </div>
                </div>
                <Text className="mt-3 text-xs text-muted">
                  Tax amounts use Cogito’s configurable defaults. Confirm the
                  applicable treatment with a tax adviser; this estimate is not
                  legal validation or tax advice.
                </Text>
                {!pendingPayout.taxProfileComplete ? (
                  <Text className="mt-2 text-sm text-warning">
                    Add your legal name and 16-digit NIK in your profile before
                    a new payout can be prepared. You can continue teaching.
                  </Text>
                ) : null}
                {!pendingPayout.payoutAccountComplete ? (
                  <Text className="mt-2 text-sm text-warning">
                    Complete your bank details before an admin prepares a
                    payout. You can continue teaching.
                  </Text>
                ) : null}
                {pendingPayout.netHonorariumIdr === null ? (
                  <Text className="mt-2 text-sm text-warning">
                    The current deductions exceed this unpaid gross amount, so a
                    payout cannot be prepared for this batch.
                  </Text>
                ) : null}
              </>
            )}
            {payoutHistory.length > 0 ? (
              <div className="mt-5 border-t border-border pt-4">
                <Text className="font-semibold">Recent payout history</Text>
                <div className="mt-2 divide-y divide-item-border">
                  {payoutHistory.slice(0, 3).map((row) => {
                    const hasSavedSessionDetails =
                      row.items.length > 0 || row.status === "prepared";
                    const taxSnapshotUnavailable =
                      row.taxRateBps === null || row.taxHonorariumIdr === null;
                    return (
                      <div key={row.id} className="py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <Text className="text-sm font-medium">
                            {payoutStatusLabel(row.status)} ·{" "}
                            {formatPayoutDate(row.paidAt)}
                          </Text>
                          <Text className="text-sm font-semibold">
                            {formatIdr(
                              row.actualAmountIdr ?? row.netHonorariumIdr,
                            )}
                          </Text>
                        </div>
                        <Text className="mt-1 text-xs text-muted">
                          {formatPayoutCoverageLabel(
                            row.items.length,
                            hasSavedSessionDetails,
                          )}{" "}
                          · gross {formatIdr(row.grossHonorariumIdr)} · tax{" "}
                          {taxSnapshotUnavailable
                            ? "Tax snapshot unavailable"
                            : `${formatTaxRateSnapshot(row.taxRateBps)} / ${formatIdr(row.taxHonorariumIdr)}`}{" "}
                          · fee {formatIdr(row.transferFeeIdr)}
                        </Text>
                        {row.items.length > 0 ? (
                          <ul
                            aria-label="Covered payout sessions"
                            className="mt-2 space-y-1"
                          >
                            {row.items.map((item) => (
                              <li key={item.sourceKey}>
                                <Text className="text-xs text-muted">
                                  Booking #{item.bookingNumber} ·{" "}
                                  {item.bookingType} ·{" "}
                                  {formatPayoutDate(item.scheduledStartAt)}
                                </Text>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </CardBody>
        </Card>

        <NextLessonSection
          booking={nextBooking}
          isLoading={bookings.isPending}
          viewerRole="tutor"
        />
      </div>
    </Stack>
  );
}
function NeedsActionCard({
  isLoading,
  actionItems,
}: {
  isLoading: boolean;
  actionItems: BookingCardData[];
}) {
  return (
    <Card className="min-w-0">
      <CardHeader className="py-3">
        <CardTitle>Needs action</CardTitle>
        <CardHeaderAction>
          <Button
            variant="plain"
            size="xs"
            nativeButton={false}
            render={<Link to="/bookings" aria-label="See all tutor bookings" />}
          >
            See all <IconArrowRight />
          </Button>
        </CardHeaderAction>
      </CardHeader>
      <CardBody>
        {isLoading ? (
          <Loader />
        ) : actionItems.length > 0 ? (
          <Stack direction="column" spacing="sm" className="m-0!">
            {actionItems.slice(0, 3).map((booking) => (
              <BookingAction
                key={booking.id}
                booking={booking}
                actionLabel={getTutorActionLabel(booking.currentState)}
              />
            ))}
          </Stack>
        ) : (
          <EmptyState
            icon={<IconInbox />}
            title="Nothing needs action"
            description="Bookings requiring your response will appear here."
            size="compact"
            tone="warning"
            className="rounded-lg"
          />
        )}
      </CardBody>
    </Card>
  );
}

function getTutorActionLabel(state: BookingCardData["currentState"]) {
  if (state === "awaiting_tutor_review") return "Review request";
  if (state === "reschedule_proposed") return "Review reschedule";
  if (state === "scheduled") return "Complete session";
  return "View details";
}

function BookingAction({
  booking,
  actionLabel,
}: {
  booking: Pick<
    BookingCardData,
    "id" | "currentState" | "scheduledStartAt" | "timezone" | "proposer"
  >;
  actionLabel: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-item-border bg-item p-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Text className="font-semibold">
            {booking.proposer?.name ?? "Cogito student"}
          </Text>
          <Badge variant={getBookingStateVariant(booking.currentState)} pill>
            {getBookingStateLabel(booking.currentState)}
          </Badge>
        </div>
        <Text className="mt-1 text-sm text-muted">
          {formatBookingDate(booking.scheduledStartAt, booking.timezone)}
        </Text>
      </div>
      <Button
        size="sm"
        variant={
          booking.currentState === "awaiting_tutor_review"
            ? "primary"
            : "secondary"
        }
        nativeButton={false}
        render={
          <Link
            to="/bookings/$bookingId"
            params={{ bookingId: booking.id }}
            aria-label={`${actionLabel} for ${booking.proposer?.name ?? "Cogito student"}`}
          />
        }
      >
        {actionLabel} <IconArrowRight />
      </Button>
    </div>
  );
}
