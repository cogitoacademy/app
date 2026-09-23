"use client";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { IconArrowRight, IconInbox } from "@tabler/icons-react";
import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Card,
  CardBody,
  CardHeader,
  CardHeaderAction,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import { Text } from "@cogito-app/ui/components/selia/text";

import { EmptyState } from "@/components/empty-state";
import { InfoPreview } from "@/components/info-preview";
import Loader from "@/components/loader";
import {
  isUpcomingBooking,
  NextLessonSection,
  type BookingCardData,
} from "@/components/booking/booking-card";
import { DashboardWelcomeCard } from "@/components/dashboard/dashboard-welcome-card";
import {
  formatBookingDate,
  getBookingStateLabel,
  getBookingStateVariant,
} from "@/components/booking/booking-ui";
import { useNow } from "@/hooks/use-now";
import { orpc } from "@/utils/orpc";

const NON_BCA_TRANSFER_FEE_IDR = 2_500;

export function TutorDashboardPage({ tutorName }: { tutorName: string }) {
  const now = useNow();
  const bookings = useQuery(
    orpc.booking.listMine.queryOptions({ input: { limit: 100 } }),
  );
  const profile = useQuery(orpc.tutor.getMyProfile.queryOptions());
  const payouts = useQuery(orpc.tutor.getMyPayouts.queryOptions({ input: {} }));

  const items = (bookings.data?.items ?? []) as BookingCardData[];
  const reviewQueue = items.filter(
    (booking) => booking.currentState === "awaiting_tutor_review",
  );
  const upcoming = items
    .filter((booking) => isUpcomingBooking(booking, now))
    .toSorted(
      (a, b) =>
        new Date(a.scheduledStartAt).getTime() -
        new Date(b.scheduledStartAt).getTime(),
    );
  const nextBooking = upcoming[0];
  const pendingHonorarium = payouts.data?.tutorPayoutIdr ?? 0;
  const hasBankDetails = Boolean(
    profile.data?.bankName?.trim() &&
    profile.data?.bankAccountNumber?.trim() &&
    profile.data?.bankAccountHolderName?.trim() &&
    profile.data?.bankAccountOpeningCity?.trim() &&
    profile.data?.bankAccountOwnership &&
    profile.data?.bankTransferDisclaimerAccepted,
  );
  const usesBca = profile.data?.bankName?.trim().toUpperCase() === "BCA";
  const transferFee =
    pendingHonorarium > 0 && hasBankDetails && !usesBca
      ? NON_BCA_TRANSFER_FEE_IDR
      : 0;
  const estimatedPayout = Math.max(0, pendingHonorarium - transferFee);

  return (
    <Stack direction="column" spacing="md">
      <div className="grid gap-4 lg:grid-cols-2">
        <DashboardWelcomeCard
          name={tutorName}
          viewerRole="tutor"
          reviewCount={reviewQueue.length}
        />

        <ReviewRequestsCard
          isLoading={bookings.isPending}
          reviewQueue={reviewQueue}
        />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader className="py-4">
            <CardTitle>Payout details</CardTitle>
            <CardHeaderAction>
              <InfoPreview
                title="Payout details"
                description="Honorarium from completed sessions that have not yet been paid by an admin. Payouts are processed weekly, then this amount is cleared against the recorded payout."
                label="About payout details"
              />
            </CardHeaderAction>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Text className="text-sm text-muted">Completed sessions</Text>
                <Text className="mt-1 text-lg font-semibold">
                  {payouts.data?.completedSessions ?? 0}
                </Text>
              </div>
              <div>
                <Text className="text-sm text-muted">Unpaid honorarium</Text>
                <Text className="mt-1 text-lg font-semibold">
                  Rp{pendingHonorarium.toLocaleString("id-ID")}
                </Text>
                <Text className="mt-1 text-sm text-muted">
                  {payouts.data?.completedSessions ?? 0} completed session
                  {(payouts.data?.completedSessions ?? 0) === 1 ? "" : "s"}
                </Text>
              </div>
            </div>
            <div className="mt-4 rounded-lg bg-accent p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-1.5">
                  <Text className="text-sm text-muted">
                    {!hasBankDetails
                      ? "Transfer fee"
                      : usesBca
                        ? "BCA transfer fee"
                        : "Non-BCA transfer fee"}
                  </Text>
                  <InfoPreview
                    title="Transfer fee"
                    description="Conventional BCA is free. BCA Syariah, blu (BCA Digital), and other banks incur Rp2.500 once per payout, deducted from your honorarium. The amount clears after an admin marks the payout as paid."
                    label="About transfer fees"
                  />
                </div>
                <Text className="font-medium">
                  {transferFee > 0
                    ? `−Rp${transferFee.toLocaleString("id-ID")}`
                    : "Rp0"}
                </Text>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <Text className="font-medium">Estimated next payout</Text>
                <Text className="font-semibold">
                  Rp{estimatedPayout.toLocaleString("id-ID")}
                </Text>
              </div>
              {!hasBankDetails ? (
                <Text className="mt-2 text-sm text-warning">
                  Complete your payout account details in your tutor profile
                  before requesting a payout.
                </Text>
              ) : null}
            </div>
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
function ReviewRequestsCard({
  isLoading,
  reviewQueue,
}: {
  isLoading: boolean;
  reviewQueue: BookingCardData[];
}) {
  return (
    <Card className="min-w-0">
      <CardHeader className="py-3">
        <CardTitle>Requests to review</CardTitle>
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
        ) : reviewQueue.length > 0 ? (
          <Stack direction="column" spacing="sm" className="m-0!">
            {reviewQueue.slice(0, 3).map((booking) => (
              <BookingAction
                key={booking.id}
                booking={booking}
                actionLabel="Review request"
              />
            ))}
          </Stack>
        ) : (
          <EmptyState
            icon={<IconInbox />}
            title="No requests to review"
            description="New student requests will appear here."
            size="compact"
            tone="warning"
            className="rounded-lg"
          />
        )}
      </CardBody>
    </Card>
  );
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
