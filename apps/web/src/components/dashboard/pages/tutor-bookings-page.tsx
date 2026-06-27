"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardBody,
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
  awaiting_tutor_review: "Needs review",
  scheduled: "Scheduled",
  completed: "Completed",
  cancelled: "Cancelled",
  declined: "Declined",
};

const STATE_VARIANTS: Record<
  string,
  "warning" | "info" | "success" | "danger"
> = {
  awaiting_tutor_review: "warning",
  scheduled: "info",
  completed: "success",
  cancelled: "danger",
  declined: "danger",
};

export function TutorBookingsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery(
    orpc.booking.listMine.queryOptions({ input: {} }),
  );

  const accept = useMutation(
    orpc.tutorActions.acceptBooking.mutationOptions({
      onSuccess: () => {
        toast.success("Booking accepted");
        void queryClient.invalidateQueries({
          queryKey: orpc.booking.listMine.queryKey({ input: {} }),
        });
      },
      onError: (err: Error) => toast.error(err.message),
    }),
  );

  const decline = useMutation(
    orpc.tutorActions.declineBooking.mutationOptions({
      onSuccess: () => {
        toast.success("Booking declined");
        void queryClient.invalidateQueries({
          queryKey: orpc.booking.listMine.queryKey({ input: {} }),
        });
      },
      onError: (err: Error) => toast.error(err.message),
    }),
  );

  const complete = useMutation(
    orpc.tutorActions.completeSession.mutationOptions({
      onSuccess: () => {
        toast.success("Session completed");
        void queryClient.invalidateQueries({
          queryKey: orpc.booking.listMine.queryKey({ input: {} }),
        });
      },
      onError: (err: Error) => toast.error(err.message),
    }),
  );

  const bookings = (data?.items ?? []).filter(
    (b) =>
      b.currentState === "awaiting_tutor_review" ||
      b.currentState === "scheduled",
  );

  return (
    <Stack direction="column" spacing="lg">
      <div>
        <Heading size="md">Incoming Bookings</Heading>
        <Text className="text-muted">Review and manage your bookings.</Text>
      </div>

      {isLoading ? (
        <Text className="text-muted">Loading bookings...</Text>
      ) : bookings.length === 0 ? (
        <Text className="text-muted">No incoming bookings.</Text>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {bookings.map((b) => (
            <Card key={b.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>
                    {b.type === "solo"
                      ? "Solo session"
                      : b.type === "group"
                        ? "Group session"
                        : "Series"}
                  </CardTitle>
                  <Badge
                    variant={STATE_VARIANTS[b.currentState] ?? "secondary"}
                  >
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
                <div className="mt-3 flex flex-wrap gap-2">
                  {b.currentState === "awaiting_tutor_review" && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => accept.mutate({ bookingId: b.id })}
                        progress={accept.isPending}
                        disabled={accept.isPending}
                      >
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => decline.mutate({ bookingId: b.id })}
                        progress={decline.isPending}
                        disabled={decline.isPending}
                      >
                        Decline
                      </Button>
                    </>
                  )}
                  {b.currentState === "scheduled" && (
                    <Button
                      size="sm"
                      onClick={() => complete.mutate({ bookingId: b.id })}
                      progress={complete.isPending}
                      disabled={complete.isPending}
                    >
                      Complete
                    </Button>
                  )}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </Stack>
  );
}
