"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import { Text } from "@cogito-app/ui/components/selia/text";
import { Button } from "@cogito-app/ui/components/selia/button";
import { Badge } from "@cogito-app/ui/components/selia/badge";
import { toast } from "sonner";

import { orpc } from "@/utils/orpc";

const STATE_LABELS: Record<string, string> = {
  awaiting_tutor_review: "Awaiting tutor",
  scheduled: "Scheduled",
  completed: "Completed",
  cancelled: "Cancelled",
  declined: "Declined",
  expired: "Expired",
  awaiting_participant_confirmation: "Awaiting participants",
};

const STATE_VARIANTS: Record<string, string> = {
  awaiting_tutor_review: "warning",
  scheduled: "info",
  completed: "success",
  cancelled: "danger",
  declined: "danger",
  expired: "danger",
  awaiting_participant_confirmation: "warning",
};

export function BookingsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery(
    orpc.booking.listMine.queryOptions({ input: {} }),
  );

  const cancel = useMutation(
    orpc.booking.cancel.mutationOptions({
      onSuccess: () => {
        toast.success("Booking cancelled");
        void queryClient.invalidateQueries({
          queryKey: orpc.booking.listMine.queryKey({ input: {} }),
        });
      },
      onError: (err: Error) => toast.error(err.message),
    }),
  );

  const bookings = data?.items ?? [];

  return (
    <Stack direction="column" spacing="lg">
      <div>
        <Heading size="md">My Bookings</Heading>
        <Text className="text-muted">Sessions you have booked.</Text>
      </div>

      {isLoading ? (
        <Text className="text-muted">Loading bookings...</Text>
      ) : bookings.length === 0 ? (
        <Text className="text-muted">No bookings yet.</Text>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {bookings.map((b) => (
            <Card
              key={b.id}
              className="transition-shadow hover:shadow-card"
              data-slot="booking-card"
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>
                    {b.type === "solo"
                      ? "Solo session"
                      : b.type === "group"
                        ? "Group session"
                        : "Series"}
                  </CardTitle>
                  <Badge variant={STATE_VARIANTS[b.currentState] as never}>
                    {STATE_LABELS[b.currentState] ?? b.currentState}
                  </Badge>
                </div>
              </CardHeader>
              <CardBody>
                <Text className="text-sm text-muted">
                  {new Date(b.scheduledStartAt).toLocaleString("id-ID", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                  {" — "}
                  {b.modality}
                </Text>
              </CardBody>
              <CardFooter className="flex items-center justify-between">
                <Text className="text-sm text-dimmed">
                  {b.currentState === "awaiting_tutor_review"
                    ? "Waiting for tutor confirmation"
                    : b.currentState}
                </Text>
                {b.currentState !== "completed" &&
                  b.currentState !== "cancelled" &&
                  b.currentState !== "declined" &&
                  b.currentState !== "expired" && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => cancel.mutate({ bookingId: b.id })}
                      progress={cancel.isPending}
                      disabled={cancel.isPending}
                    >
                      Cancel
                    </Button>
                  )}
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </Stack>
  );
}
