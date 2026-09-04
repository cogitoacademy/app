"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { IconCheck, IconMapPin } from "@tabler/icons-react";
import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  CardInfoPreview,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@cogito-app/ui/components/selia/field";
import { IconBox } from "@cogito-app/ui/components/selia/icon-box";
import {
  getSelectItemValue,
  Select,
  SelectItem,
  SelectList,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@cogito-app/ui/components/selia/select";
import { Text } from "@cogito-app/ui/components/selia/text";

import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { InfoPreview } from "@/components/info-preview";
import { getUserFacingError } from "@/lib/error-message";
import { client, orpc } from "@/utils/orpc";
import { toastManager } from "@cogito-app/ui/components/selia/toast";

type BookingDetail = Awaited<ReturnType<typeof client.booking.get>>;
type RoomBooking = BookingDetail["roomBookings"][number];
type Room = NonNullable<RoomBooking["room"]>;

const ROOM_APPROVAL_STATE = "awaiting_admin_room_approval";
const SCHEDULED_STATE = "scheduled";
const RESCHEDULE_PROPOSED_STATE = "reschedule_proposed";

export function AdminRoomActions({
  booking,
  onBookingChanged,
  embedded = false,
}: {
  booking: BookingDetail;
  onBookingChanged: () => void;
  embedded?: boolean;
}) {
  const [roomId, setRoomId] = useState("");
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const currentRoomBooking = getLatestRoomBooking(
    booking.roomBookings,
    "confirmed",
  );
  const requestedRoomBooking = getLatestRoomBooking(
    booking.roomBookings,
    "requested",
  );
  const isAwaitingApproval = booking.currentState === ROOM_APPROVAL_STATE;
  const isRescheduleProposed =
    booking.currentState === RESCHEDULE_PROPOSED_STATE;
  const canAssign =
    !currentRoomBooking &&
    (isAwaitingApproval ||
      booking.currentState === SCHEDULED_STATE ||
      isRescheduleProposed);
  const canRelocate =
    Boolean(currentRoomBooking) &&
    (isAwaitingApproval ||
      booking.currentState === SCHEDULED_STATE ||
      isRescheduleProposed);
  const canManage = canAssign || canRelocate;
  const canCancel =
    isAwaitingApproval ||
    ((booking.currentState === SCHEDULED_STATE || isRescheduleProposed) &&
      Boolean(currentRoomBooking));
  const sameRoomAsCurrent =
    canRelocate && roomId === currentRoomBooking?.roomId;

  const roomsQuery = useQuery({
    ...orpc.room.list.queryOptions({ input: undefined }),
    enabled: canManage,
  });

  const assign = useMutation(
    orpc.room.assign.mutationOptions({
      onSuccess: () => {
        setRoomId("");
        toastManager.add({ title: "Room assigned", type: "success" });
        onBookingChanged();
      },
      onError: (error: Error) =>
        showRoomError("Room could not be assigned", error),
    }),
  );
  const relocate = useMutation(
    orpc.room.relocate.mutationOptions({
      onSuccess: () => {
        setRoomId("");
        toastManager.add({ title: "Room relocated", type: "success" });
        onBookingChanged();
      },
      onError: (error: Error) =>
        showRoomError("Room could not be relocated", error),
    }),
  );
  const cancel = useMutation(
    orpc.room.cancelBooking.mutationOptions({
      onSuccess: () => {
        setCancelDialogOpen(false);
        toastManager.add({
          title: isAwaitingApproval
            ? "Offline booking cancelled"
            : "Room assignment removed",
          type: "success",
        });
        onBookingChanged();
      },
      onError: (error: Error) =>
        showRoomError("Room assignment could not be cancelled", error),
    }),
  );
  const actionPending =
    assign.isPending || relocate.isPending || cancel.isPending;

  function submitRoomAction() {
    if (!roomId || !canManage || sameRoomAsCurrent) return;

    const input = {
      bookingId: booking.id,
      roomId,
      startAt: new Date(booking.scheduledStartAt),
      endAt: new Date(booking.scheduledEndAt),
    };

    if (canRelocate) relocate.mutate(input);
    else assign.mutate(input);
  }

  function confirmCancellation() {
    cancel.mutate({ bookingId: booking.id });
  }

  return (
    <>
      <Card
        className={
          embedded
            ? "min-w-0 border-0 bg-transparent shadow-none"
            : "min-w-0 overflow-hidden"
        }
      >
        <CardHeader>
          <CardTitle>
            {embedded ? "Room assignment" : "Offline room"}
            <CardInfoPreview>
              <InfoPreview
                title={embedded ? "Room assignment" : "Offline room"}
                description={
                  canRelocate
                    ? "Review the current room or move this booking to another room."
                    : canAssign
                      ? "Choose a room to confirm this offline booking."
                      : "Room assignment is not editable in this booking state."
                }
                label="About room assignment"
              />
            </CardInfoPreview>
          </CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <RoomSummary
            label={currentRoomBooking ? "Current room" : "Room status"}
            room={currentRoomBooking?.room}
            empty={
              isAwaitingApproval ? "No room confirmed yet" : "No room assigned"
            }
          />

          {requestedRoomBooking && !currentRoomBooking ? (
            <div className="flex items-start gap-3 rounded-lg border border-warning-border bg-warning/10 p-3">
              <IconMapPin
                className="mt-0.5 size-4 shrink-0 text-warning-foreground"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Text className="text-sm font-medium">Requested room</Text>
                  <Badge variant="warning" pill>
                    Pending approval
                  </Badge>
                </div>
                <Text className="text-sm text-muted">
                  {requestedRoomBooking.room
                    ? `${requestedRoomBooking.room.name} · ${requestedRoomBooking.room.location}`
                    : "The requested room is no longer active."}
                </Text>
              </div>
            </div>
          ) : null}

          {canManage ? (
            <Field>
              <FieldLabel htmlFor="admin-room-target">Target room</FieldLabel>
              <Select
                value={roomId}
                onValueChange={(value) =>
                  setRoomId(getSelectItemValue(value) ?? "")
                }
              >
                <SelectTrigger id="admin-room-target">
                  <SelectValue
                    placeholder={
                      canRelocate ? "Select a different room" : "Select a room"
                    }
                  />
                </SelectTrigger>
                <SelectPopup>
                  <SelectList>
                    {roomsQuery.data?.map((room) => (
                      <SelectItem key={room.id} value={room.id}>
                        {room.name} · {room.location} · {room.capacity} seats
                      </SelectItem>
                    ))}
                  </SelectList>
                </SelectPopup>
              </Select>
              <FieldDescription>
                {roomsQuery.isPending
                  ? "Loading rooms…"
                  : roomsQuery.isError
                    ? "Rooms could not be loaded. Refresh the page and try again."
                    : roomsQuery.data?.length === 0
                      ? "No active rooms are available. Add a room before continuing."
                      : canRelocate
                        ? "Room conflicts are checked again when you relocate."
                        : "Room conflicts are checked again when you assign it."}
              </FieldDescription>
            </Field>
          ) : booking.currentState === SCHEDULED_STATE ? (
            <Text className="text-sm text-muted">
              This booking will continue without a room.
            </Text>
          ) : null}
        </CardBody>
        {canManage || canCancel ? (
          <CardFooter className="flex-wrap justify-end gap-2">
            {canCancel ? (
              <Button
                variant="danger"
                onClick={() => setCancelDialogOpen(true)}
                disabled={actionPending}
              >
                {isAwaitingApproval ? "Cancel booking" : "Remove room"}
              </Button>
            ) : null}
            {canManage ? (
              <Button
                onClick={submitRoomAction}
                progress={assign.isPending || relocate.isPending}
                disabled={
                  !roomId ||
                  roomsQuery.isPending ||
                  sameRoomAsCurrent ||
                  assign.isPending ||
                  relocate.isPending
                }
              >
                <IconCheck />
                {canRelocate ? "Relocate room" : "Assign room"}
              </Button>
            ) : null}
          </CardFooter>
        ) : null}
      </Card>

      <ConfirmationDialog
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
        title={
          isAwaitingApproval
            ? "Cancel this offline booking?"
            : "Remove this room assignment?"
        }
        description={
          isAwaitingApproval
            ? "This will cancel the offline booking, release held Marks, and notify the tutor and confirmed students."
            : "The booking will continue, but it will no longer have a confirmed room."
        }
        confirmLabel={isAwaitingApproval ? "Cancel booking" : "Remove room"}
        confirmVariant="danger"
        pending={cancel.isPending}
        onConfirm={confirmCancellation}
      />
    </>
  );
}

function RoomSummary({
  label,
  room,
  empty,
}: {
  label: string;
  room: Room | null | undefined;
  empty: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <IconBox variant="tertiary" size="sm" aria-hidden="true">
        <IconMapPin />
      </IconBox>
      <div className="min-w-0">
        <Text className="text-sm text-muted">{label}</Text>
        {room ? (
          <>
            <Text className="font-medium">{room.name}</Text>
            <Text className="break-words text-sm text-muted">
              {room.location} · capacity {room.capacity}
            </Text>
          </>
        ) : (
          <Text className="font-medium text-muted">{empty}</Text>
        )}
      </div>
    </div>
  );
}

function getLatestRoomBooking(
  roomBookings: BookingDetail["roomBookings"],
  status: RoomBooking["status"],
) {
  return roomBookings
    .filter((entry) => entry.status === status)
    .toSorted(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )[0];
}

function showRoomError(title: string, error: Error) {
  toastManager.add({
    title,
    description: getUserFacingError(error),
    type: "error",
  });
}
