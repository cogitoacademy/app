"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconAlertTriangle,
  IconBuilding,
  IconCalendarEvent,
  IconCoins,
  IconSearch,
} from "@tabler/icons-react";
import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Card,
  CardBody,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@cogito-app/ui/components/selia/dialog";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@cogito-app/ui/components/selia/field";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { IconBox } from "@cogito-app/ui/components/selia/icon-box";
import { Input } from "@cogito-app/ui/components/selia/input";
import {
  getSelectItemValue,
  Select,
  SelectItem,
  SelectList,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@cogito-app/ui/components/selia/select";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
} from "@cogito-app/ui/components/selia/table";
import {
  Tabs,
  TabsItem,
  TabsList,
  TabsPanel,
} from "@cogito-app/ui/components/selia/tabs";
import { Text } from "@cogito-app/ui/components/selia/text";
import { toastManager } from "@cogito-app/ui/components/selia/toast";

import {
  formatBookingDate,
  getBookingStateLabel,
  getBookingStateVariant,
} from "@/components/booking/booking-ui";
import { client, orpc } from "@/utils/orpc";

const TEXTAREA_CLASS =
  "min-h-24 w-full resize-y rounded-lg border border-input-border bg-background px-3 py-2 text-foreground outline-none placeholder:text-dimmed focus:border-input-accent-border";
const OVERRIDE_CATEGORIES = [
  "tutor_no_show",
  "medical_emergency",
  "technical_failure",
  "admin_correction",
  "student_no_show",
  "force_cancel",
] as const;
const MARKS_ACTIONS = [
  "release_holds",
  "compensate_credit",
  "compensate_deduct",
] as const;
type OverrideCategory = (typeof OVERRIDE_CATEGORIES)[number];
type MarksAction = (typeof MARKS_ACTIONS)[number];
type Urgency = "all" | "high" | "medium" | "low";

export function AdminOperationsPage() {
  return (
    <Stack direction="column" spacing="lg">
      <div>
        <Heading size="md">Operations</Heading>
        <Text className="text-muted">
          Monitor bookings, preview overrides, inspect wallets, and assign
          offline rooms.
        </Text>
      </div>
      <Tabs defaultValue="queue">
        <TabsList>
          <TabsItem value="queue">
            <IconCalendarEvent /> Booking queue
          </TabsItem>
          <TabsItem value="wallet">
            <IconCoins /> Wallet lookup
          </TabsItem>
          <TabsItem value="rooms">
            <IconBuilding /> Rooms
          </TabsItem>
        </TabsList>
        <TabsPanel value="queue">
          <BookingQueue />
        </TabsPanel>
        <TabsPanel value="wallet">
          <WalletLookup />
        </TabsPanel>
        <TabsPanel value="rooms">
          <RoomOperations />
        </TabsPanel>
      </Tabs>
    </Stack>
  );
}

function BookingQueue() {
  const queryClient = useQueryClient();
  const [urgency, setUrgency] = useState<Urgency>("all");
  const [escalatedOnly, setEscalatedOnly] = useState(false);
  const [selected, setSelected] = useState<QueueItem | null>(null);
  const queryInput = {
    limit: 50,
    ...(urgency !== "all" ? { urgency } : {}),
    ...(escalatedOnly ? { escalated: true } : {}),
  };
  const queueQuery = useQuery(
    orpc.adminBooking.listBookings.queryOptions({ input: queryInput }),
  );

  return (
    <Stack direction="column" spacing="md">
      <Card>
        <CardBody className="flex flex-wrap items-end gap-3">
          <Field className="min-w-48">
            <FieldLabel>Urgency</FieldLabel>
            <Select
              value={urgency}
              onValueChange={(value) =>
                setUrgency(getSelectItemValue(value) as Urgency)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectPopup>
                <SelectList>
                  <SelectItem value="all">All urgency levels</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectList>
              </SelectPopup>
            </Select>
          </Field>
          <Button
            variant={escalatedOnly ? "primary" : "secondary"}
            onClick={() => setEscalatedOnly((value) => !value)}
          >
            <IconAlertTriangle /> Escalated only
          </Button>
        </CardBody>
      </Card>
      {queueQuery.isPending ? (
        <LoadingCard />
      ) : queueQuery.isError ? (
        <ErrorCard
          message={queueQuery.error.message}
          onRetry={() => void queueQuery.refetch()}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Booking monitor</CardTitle>
            <CardDescription>
              Urgent and action-required bookings appear first.
            </CardDescription>
          </CardHeader>
          <CardBody>
            <TableContainer>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Booking</TableHead>
                    <TableHead>Schedule</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Marks</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {queueQuery.data.items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Text className="font-mono text-xs">{item.id}</Text>
                        <Text className="text-xs text-muted">
                          {item.type} · {item.modality}
                        </Text>
                      </TableCell>
                      <TableCell>
                        {formatBookingDate(
                          item.scheduledStartAt,
                          item.timezone,
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          <Badge
                            variant={getBookingStateVariant(item.currentState)}
                          >
                            {getBookingStateLabel(item.currentState)}
                          </Badge>
                          {item.escalated ? (
                            <Badge variant="danger">Escalated</Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>{item.holdAmount} held</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setSelected(item)}
                        >
                          Review
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            {queueQuery.data.items.length === 0 ? (
              <Text className="py-8 text-center text-muted">
                No bookings match these filters.
              </Text>
            ) : null}
          </CardBody>
        </Card>
      )}
      <OverrideDialog
        booking={selected}
        onClose={() => setSelected(null)}
        onApplied={() => {
          setSelected(null);
          void queryClient.invalidateQueries({
            queryKey: orpc.adminBooking.listBookings.key(),
          });
        }}
      />
    </Stack>
  );
}

type QueueItem = Awaited<
  ReturnType<typeof client.adminBooking.listBookings>
>["items"][number];

function OverrideDialog({
  booking,
  onClose,
  onApplied,
}: {
  booking: QueueItem | null;
  onClose: () => void;
  onApplied: () => void;
}) {
  const [category, setCategory] =
    useState<OverrideCategory>("admin_correction");
  const [marksAction, setMarksAction] = useState<MarksAction | "none">("none");
  const [reason, setReason] = useState("");
  const [participantIds, setParticipantIds] = useState("");
  const [userNote, setUserNote] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);

  const buildInput = () => ({
    bookingId: booking!.id,
    category,
    reason: reason.trim(),
    affectedParticipants: participantIds
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
    ...(marksAction !== "none" ? { marksAction } : {}),
    userNote: userNote.trim() || undefined,
    internalNote: internalNote.trim() || undefined,
  });
  const previewMutation = useMutation(
    orpc.adminBooking.previewOverride.mutationOptions({
      onSuccess: setPreview,
      onError: (error: Error) => showError("Override preview failed", error),
    }),
  );
  const applyMutation = useMutation(
    orpc.adminBooking.applyOverride.mutationOptions({
      onSuccess: () => {
        toastManager.add({ title: "Override applied", type: "success" });
        onApplied();
      },
      onError: (error: Error) =>
        showError("Override could not be applied", error),
    }),
  );

  return (
    <Dialog open={booking !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogPopup className="max-w-2xl">
        <DialogHeader className="flex-col items-start gap-1">
          <DialogTitle>Emergency override</DialogTitle>
          <DialogDescription>
            {booking?.id} · current state{" "}
            {booking ? getBookingStateLabel(booking.currentState) : ""}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel>Category</FieldLabel>
              <Select
                value={category}
                onValueChange={(value) => {
                  setCategory(getSelectItemValue(value) as OverrideCategory);
                  setPreview(null);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectPopup>
                  <SelectList>
                    {OVERRIDE_CATEGORIES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {humanize(value)}
                      </SelectItem>
                    ))}
                  </SelectList>
                </SelectPopup>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Marks action</FieldLabel>
              <Select
                value={marksAction}
                onValueChange={(value) => {
                  setMarksAction(
                    getSelectItemValue(value) as MarksAction | "none",
                  );
                  setPreview(null);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectPopup>
                  <SelectList>
                    <SelectItem value="none">No Marks change</SelectItem>
                    {MARKS_ACTIONS.map((value) => (
                      <SelectItem key={value} value={value}>
                        {humanize(value)}
                      </SelectItem>
                    ))}
                  </SelectList>
                </SelectPopup>
              </Select>
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="override-reason">Reason</FieldLabel>
            <textarea
              id="override-reason"
              className={TEXTAREA_CLASS}
              value={reason}
              maxLength={2_000}
              onChange={(event) => {
                setReason(event.target.value);
                setPreview(null);
              }}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="participant-ids">
              Affected participant user IDs
            </FieldLabel>
            <Input
              id="participant-ids"
              value={participantIds}
              onChange={(event) => {
                setParticipantIds(event.target.value);
                setPreview(null);
              }}
              placeholder="user-id-1, user-id-2"
            />
            <FieldDescription>
              Required for Marks changes and user notifications.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="user-note">User-visible note</FieldLabel>
            <Input
              id="user-note"
              value={userNote}
              maxLength={2_000}
              onChange={(event) => setUserNote(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="internal-note">Internal admin note</FieldLabel>
            <Input
              id="internal-note"
              value={internalNote}
              maxLength={2_000}
              onChange={(event) => setInternalNote(event.target.value)}
            />
          </Field>
          {preview ? (
            <Card className="border-info-border bg-info/5">
              <CardBody className="space-y-2">
                <Text className="font-medium">Before → after</Text>
                <Text>
                  {getBookingStateLabel(preview.currentState)} →{" "}
                  {getBookingStateLabel(preview.projectedState)}
                </Text>
                <Text className="text-muted">
                  {preview.perParticipantImpact.length} wallet impact(s) ·{" "}
                  {preview.marksAction
                    ? humanize(preview.marksAction)
                    : "No Marks change"}
                </Text>
                {preview.perParticipantImpact.map((impact) => (
                  <Text key={impact.userId} className="text-sm">
                    {impact.userId}: available {impact.before.availableBalance}{" "}
                    → {impact.after.availableBalance}, held{" "}
                    {impact.before.heldBalance} → {impact.after.heldBalance}
                  </Text>
                ))}
              </CardBody>
            </Card>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={() => previewMutation.mutate(buildInput())}
            progress={previewMutation.isPending}
            disabled={!reason.trim() || previewMutation.isPending}
          >
            Preview
          </Button>
          <Button
            variant="danger"
            onClick={() => applyMutation.mutate(buildInput())}
            progress={applyMutation.isPending}
            disabled={!preview || applyMutation.isPending}
          >
            Apply override
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

type PreviewResult = Awaited<
  ReturnType<typeof client.adminBooking.previewOverride>
>;

function WalletLookup() {
  const [userId, setUserId] = useState("");
  const [searchedUserId, setSearchedUserId] = useState("");
  const walletQuery = useQuery({
    ...orpc.admin.getWallet.queryOptions({ input: { userId: searchedUserId } }),
    enabled: Boolean(searchedUserId),
  });
  const ledgerQuery = useQuery({
    ...orpc.admin.listLedgerEntries.queryOptions({
      input: { userId: searchedUserId, limit: 50 },
    }),
    enabled: Boolean(searchedUserId) && walletQuery.isSuccess,
  });
  return (
    <Stack direction="column" spacing="md">
      <Card>
        <CardHeader>
          <CardTitle>Find a wallet</CardTitle>
          <CardDescription>Enter an exact Cogito user ID.</CardDescription>
        </CardHeader>
        <CardBody className="flex gap-2">
          <Input
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
            placeholder="User ID"
          />
          <Button
            onClick={() => setSearchedUserId(userId.trim())}
            disabled={!userId.trim()}
          >
            <IconSearch /> Search
          </Button>
        </CardBody>
      </Card>
      {walletQuery.isError ? (
        <ErrorCard
          message={walletQuery.error.message}
          onRetry={() => void walletQuery.refetch()}
        />
      ) : walletQuery.data ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <BalanceCard label="Total" value={walletQuery.data.totalBalance} />
          <BalanceCard label="Held" value={walletQuery.data.heldBalance} />
          <BalanceCard
            label="Available"
            value={walletQuery.data.availableBalance}
          />
        </div>
      ) : null}
      {ledgerQuery.data ? (
        <Card>
          <CardHeader>
            <CardTitle>Ledger</CardTitle>
            <CardDescription>Latest wallet entries</CardDescription>
          </CardHeader>
          <CardBody>
            <TableContainer>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Booking</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledgerQuery.data.items.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>
                        <Badge variant="secondary">
                          {humanize(entry.entryType)}
                        </Badge>
                      </TableCell>
                      <TableCell>{entry.amount} Marks</TableCell>
                      <TableCell>{entry.bookingId ?? "—"}</TableCell>
                      <TableCell>
                        {formatBookingDate(entry.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardBody>
        </Card>
      ) : null}
    </Stack>
  );
}

function RoomOperations() {
  const queryClient = useQueryClient();
  const [operation, setOperation] = useState<"assign" | "relocate">("assign");
  const [bookingId, setBookingId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const roomsQuery = useQuery(
    orpc.room.list.queryOptions({ input: undefined }),
  );
  const assign = useMutation(
    orpc.room.assign.mutationOptions({
      onSuccess: () => {
        toastManager.add({ title: "Room assigned", type: "success" });
        void queryClient.invalidateQueries({ queryKey: orpc.room.list.key() });
      },
      onError: (error: Error) => showError("Room could not be assigned", error),
    }),
  );
  const relocate = useMutation(
    orpc.room.relocate.mutationOptions({
      onSuccess: () => {
        toastManager.add({ title: "Room relocated", type: "success" });
        void queryClient.invalidateQueries({ queryKey: orpc.room.list.key() });
      },
      onError: (error: Error) =>
        showError("Room could not be relocated", error),
    }),
  );
  const cancel = useMutation(
    orpc.room.cancelBooking.mutationOptions({
      onSuccess: () =>
        toastManager.add({ title: "Room booking cancelled", type: "success" }),
      onError: (error: Error) =>
        showError("Room booking could not be cancelled", error),
    }),
  );
  const valid =
    bookingId.trim() &&
    roomId &&
    startAt &&
    endAt &&
    new Date(endAt) > new Date(startAt);
  return (
    <Stack direction="column" spacing="md">
      <Card>
        <CardHeader>
          <CardTitle>Offline room assignment</CardTitle>
          <CardDescription>
            Assign an active room to an offline booking.
          </CardDescription>
        </CardHeader>
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel>Operation</FieldLabel>
            <Select
              value={operation}
              onValueChange={(value) =>
                setOperation(getSelectItemValue(value) as "assign" | "relocate")
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectPopup>
                <SelectList>
                  <SelectItem value="assign">Assign room</SelectItem>
                  <SelectItem value="relocate">Relocate room</SelectItem>
                </SelectList>
              </SelectPopup>
            </Select>
          </Field>
          <Field>
            <FieldLabel>Booking ID</FieldLabel>
            <Input
              value={bookingId}
              onChange={(event) => setBookingId(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel>Room</FieldLabel>
            <Select
              value={roomId}
              onValueChange={(value) =>
                setRoomId(getSelectItemValue(value) ?? "")
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select room" />
              </SelectTrigger>
              <SelectPopup>
                <SelectList>
                  {roomsQuery.data?.map((room) => (
                    <SelectItem key={room.id} value={room.id}>
                      {room.name} · {room.location}
                    </SelectItem>
                  ))}
                </SelectList>
              </SelectPopup>
            </Select>
          </Field>
          <Field>
            <FieldLabel>Start</FieldLabel>
            <Input
              type="datetime-local"
              value={startAt}
              onChange={(event) => setStartAt(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel>End</FieldLabel>
            <Input
              type="datetime-local"
              value={endAt}
              onChange={(event) => setEndAt(event.target.value)}
            />
          </Field>
        </CardBody>
        <CardFooter className="justify-end gap-2">
          <Button
            variant="danger"
            onClick={() => cancel.mutate({ bookingId: bookingId.trim() })}
            disabled={!bookingId.trim() || cancel.isPending}
          >
            Cancel room
          </Button>
          <Button
            onClick={() => {
              const input = {
                bookingId: bookingId.trim(),
                roomId,
                startAt: new Date(startAt),
                endAt: new Date(endAt),
              };
              if (operation === "relocate") relocate.mutate(input);
              else assign.mutate(input);
            }}
            progress={assign.isPending || relocate.isPending}
            disabled={!valid || assign.isPending || relocate.isPending}
          >
            {operation === "relocate" ? "Relocate room" : "Assign room"}
          </Button>
        </CardFooter>
      </Card>
    </Stack>
  );
}

function BalanceCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardBody className="flex items-center gap-3">
        <IconBox variant="info-subtle">
          <IconCoins />
        </IconBox>
        <div>
          <Text className="text-sm text-muted">{label}</Text>
          <Text className="text-2xl font-semibold">{value} Marks</Text>
        </div>
      </CardBody>
    </Card>
  );
}
function LoadingCard() {
  return (
    <Card>
      <CardBody className="min-h-48 animate-pulse bg-accent/30" />
    </Card>
  );
}
function ErrorCard({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <Card>
      <CardBody className="flex min-h-48 flex-col items-center justify-center text-center">
        <IconBox variant="danger-subtle">
          <IconAlertTriangle />
        </IconBox>
        <Text className="mt-3">Operations data could not be loaded</Text>
        <Text className="mt-1 text-muted">{message}</Text>
        <Button className="mt-4" variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      </CardBody>
    </Card>
  );
}
function humanize(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}
function showError(title: string, error: Error) {
  toastManager.add({ title, description: error.message, type: "error" });
}
