"use client";

import { useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import {
  keepPreviousData,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  IconAlertTriangle,
  IconBuilding,
  IconCalendarEvent,
  IconCheck,
  IconClock,
  IconCoins,
  IconRefresh,
  IconSearch,
  IconUsers,
} from "@tabler/icons-react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@cogito-app/ui/components/selia/avatar";
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
  Item,
  ItemAction,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@cogito-app/ui/components/selia/item";
import { Textarea } from "@cogito-app/ui/components/selia/textarea";
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
import { EmptyState } from "@/components/empty-state";
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
import { ManualMeetingLinkDialog } from "@/components/booking/manual-meeting-link-dialog";
import { client, orpc } from "@/utils/orpc";
import { getUserFacingError } from "@/lib/error-message";
import { CrossBrowserDateTimeInput } from "@/components/booking/minute-time-input";
import { WhatsAppSupportDialog } from "@/components/whatsapp-support-dialog";

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
const OVERRIDE_LIST_CATEGORIES = [
  ...OVERRIDE_CATEGORIES,
  "tutor_lateness_pending",
] as const;
type OverrideCategory = (typeof OVERRIDE_CATEGORIES)[number];
type MarksAction = (typeof MARKS_ACTIONS)[number];
type Urgency = "all" | "high" | "medium" | "low";
type OverrideCategoryFilter = "all" | (typeof OVERRIDE_LIST_CATEGORIES)[number];
type SlaFilter = "all" | "escalated";

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
  const [category, setCategory] = useState<OverrideCategoryFilter>("all");
  const [urgency, setUrgency] = useState<Urgency>("all");
  const [slaFilter, setSlaFilter] = useState<SlaFilter>("all");
  const [selected, setSelected] = useState<QueueItem | null>(null);
  const queryInput = {
    limit: 50,
    ...(category !== "all" ? { category } : {}),
    ...(urgency !== "all" ? { urgency } : {}),
    ...(slaFilter === "escalated" ? { escalated: true } : {}),
  };
  const queueQuery = useQuery({
    ...orpc.adminBooking.listBookings.queryOptions({ input: queryInput }),
    placeholderData: keepPreviousData,
  });

  return (
    <Stack direction="column" spacing="md">
      <Card>
        <CardBody className="flex flex-wrap items-end gap-3">
          <Field className="min-w-56">
            <FieldLabel>Override category</FieldLabel>
            <Select
              value={category}
              onValueChange={(value) =>
                setCategory(getSelectItemValue(value) as OverrideCategoryFilter)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectPopup>
                <SelectList>
                  <SelectItem value="all">All categories</SelectItem>
                  {OVERRIDE_LIST_CATEGORIES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {humanize(value)}
                    </SelectItem>
                  ))}
                </SelectList>
              </SelectPopup>
            </Select>
          </Field>
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
          <Field className="min-w-48">
            <FieldLabel>SLA status</FieldLabel>
            <Select
              value={slaFilter}
              onValueChange={(value) =>
                setSlaFilter(getSelectItemValue(value) as SlaFilter)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectPopup>
                <SelectList>
                  <SelectItem value="all">All SLA statuses</SelectItem>
                  <SelectItem value="escalated">Escalated only</SelectItem>
                </SelectList>
              </SelectPopup>
            </Select>
          </Field>
        </CardBody>
      </Card>
      {queueQuery.isPending ? (
        <LoadingCard />
      ) : queueQuery.isError ? (
        <ErrorCard
          message={getUserFacingError(
            queueQuery.error,
            "The operations data could not be loaded.",
          )}
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
          <CardBody aria-busy={queueQuery.isFetching}>
            {queueQuery.data.items.length === 0 ? (
              <EmptyState
                icon={<IconSearch />}
                title="No matching bookings"
                description="Try adjusting the booking state or search filters."
                tone="secondary"
                size="compact"
              />
            ) : (
              <TableContainer>
                <Table className="min-w-[76rem] text-sm">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-44 whitespace-nowrap">
                        Booking
                      </TableHead>
                      <TableHead className="w-44 whitespace-nowrap">
                        Schedule
                      </TableHead>
                      <TableHead className="w-40 whitespace-nowrap">
                        Status
                      </TableHead>
                      <TableHead className="min-w-56">Override</TableHead>
                      <TableHead className="w-28 whitespace-nowrap">
                        Affected
                      </TableHead>
                      <TableHead className="w-40 whitespace-nowrap">
                        SLA
                      </TableHead>
                      <TableHead className="w-28 whitespace-nowrap">
                        Marks
                      </TableHead>
                      <TableHead className="w-44" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {queueQuery.data.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="align-top">
                          <Text className="font-mono text-sm">{item.id}</Text>
                          <Text className="mt-1 text-sm text-muted">
                            {item.type} · {item.modality}
                          </Text>
                        </TableCell>
                        <TableCell className="align-top text-sm">
                          {formatBookingDate(
                            item.scheduledStartAt,
                            item.timezone,
                          )}
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="flex flex-col items-start gap-1.5">
                            <Badge
                              className="whitespace-nowrap"
                              variant={getBookingStateVariant(
                                item.currentState,
                              )}
                            >
                              {getBookingStateLabel(item.currentState)}
                            </Badge>
                            {item.escalated ? (
                              <Badge
                                className="whitespace-nowrap"
                                variant="danger"
                              >
                                Escalated
                              </Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="align-top">
                          {getOverrideCategory(item.overrideMeta) ? (
                            <Badge
                              className="whitespace-nowrap"
                              variant="secondary"
                            >
                              {humanize(
                                getOverrideCategory(item.overrideMeta)!,
                              )}
                            </Badge>
                          ) : (
                            <Text className="text-sm text-muted">
                              Standard review
                            </Text>
                          )}
                          <Text className="mt-1 max-w-56 text-sm leading-relaxed text-muted">
                            {getOverrideReason(item.overrideMeta) ??
                              "No reported reason"}
                          </Text>
                          <Text className="text-sm text-dimmed">
                            Source: admin override
                          </Text>
                        </TableCell>
                        <TableCell className="align-top text-sm">
                          {getStringArray(
                            getOverrideMetadata(item.overrideMeta)
                              ?.affectedParticipants,
                          ).length || "—"}
                        </TableCell>
                        <TableCell className="align-top">
                          <SlaStatus item={item} timezone={item.timezone} />
                        </TableCell>
                        <TableCell className="align-top whitespace-nowrap text-sm">
                          {item.holdAmount} held
                        </TableCell>
                        <TableCell className="align-top">
                          <div className="flex flex-col items-stretch gap-1.5">
                            <Button
                              size="sm"
                              variant="secondary"
                              render={
                                <Link
                                  to="/admin-operations/bookings/$bookingId"
                                  params={{ bookingId: item.id }}
                                  aria-label={`View booking ${item.id} details`}
                                />
                              }
                              nativeButton={false}
                            >
                              View details
                            </Button>
                            <Button
                              size="sm"
                              variant="plain"
                              onClick={() => setSelected(item)}
                            >
                              Override
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
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

type StateHistoryItem = Awaited<
  ReturnType<typeof client.adminBooking.getBookingStateHistory>
>[number];
type AdminBookingDetail = Awaited<ReturnType<typeof client.booking.get>>;
type AdminParticipant = AdminBookingDetail["participants"][number];
type AdminWallet = Awaited<ReturnType<typeof client.admin.getWallet>>;
type AdminLedgerPage = Awaited<
  ReturnType<typeof client.admin.listLedgerEntries>
>;
type AdminLedgerEntry = AdminLedgerPage["items"][number];

export function AdminBookingDetailPage({ bookingId }: { bookingId: string }) {
  const queryClient = useQueryClient();
  const [manualLinkDialogOpen, setManualLinkDialogOpen] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const queueItemQuery = useQuery({
    ...orpc.adminBooking.listBookings.queryOptions({
      input: { bookingId },
    }),
  });
  const booking = queueItemQuery.data?.items[0] ?? null;
  const historyQuery = useQuery({
    ...orpc.adminBooking.getBookingStateHistory.queryOptions({
      input: { bookingId: booking?.id ?? "" },
    }),
    enabled: booking !== null,
  });
  const bookingQuery = useQuery({
    ...orpc.booking.get.queryOptions({
      input: { bookingId: booking?.id ?? "" },
    }),
    enabled: booking !== null,
  });
  const participants = bookingQuery.data?.participants ?? [];
  const walletQueries = useQueries({
    queries: participants.map((participant) => ({
      ...orpc.admin.getWallet.queryOptions({
        input: { userId: participant.userId },
      }),
      enabled: booking !== null && bookingQuery.isSuccess,
    })),
  });
  const ledgerQueries = useQueries({
    queries: participants.map((participant) => ({
      ...orpc.admin.listLedgerEntries.queryOptions({
        input: {
          userId: participant.userId,
          bookingId: booking?.id,
          limit: 8,
        },
      }),
      enabled: booking !== null && bookingQuery.isSuccess,
    })),
  });
  const metadata = getOverrideMetadata(booking?.overrideMeta);
  const affectedParticipants = getStringArray(metadata?.affectedParticipants);
  const canSetManualLink =
    bookingQuery.isSuccess &&
    booking?.modality === "online" &&
    (booking.currentState === "confirmed" ||
      booking.currentState === "scheduled") &&
    (!bookingQuery.data.meetingUrl ||
      bookingQuery.data.meeting?.provider === "manual");
  const setMeetingLink = useMutation(
    orpc.adminBooking.setMeetingLink.mutationOptions({
      onSuccess: () => {
        setManualLinkDialogOpen(false);
        toastManager.add({
          title: "Meeting link saved",
          description: "The booking now has a manual session link.",
          type: "success",
        });
        void Promise.all([
          queryClient.invalidateQueries({
            queryKey: orpc.adminBooking.listBookings.key(),
          }),
          queryClient.invalidateQueries({
            queryKey: orpc.booking.get.key(),
          }),
        ]);
      },
      onError: (error: Error) =>
        showError("Meeting link could not be saved", error),
    }),
  );

  if (queueItemQuery.isPending) return <LoadingCard />;
  if (queueItemQuery.isError) {
    return (
      <ErrorCard
        message={getUserFacingError(
          queueItemQuery.error,
          "The booking detail could not be loaded.",
        )}
        onRetry={() => void queueItemQuery.refetch()}
      />
    );
  }
  if (!booking) {
    return (
      <Card>
        <CardBody>
          <EmptyState
            icon={<IconCalendarEvent />}
            title="Booking not found"
            description="This booking no longer exists or is not available to review."
            tone="secondary"
          />
        </CardBody>
        <CardFooter>
          <Button
            variant="secondary"
            render={
              <Link
                to="/admin-operations"
                aria-label="Back to admin operations"
              />
            }
            nativeButton={false}
          >
            Back to operations
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Stack direction="column" spacing="lg">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Button
            className="mb-3"
            size="sm"
            variant="plain"
            render={
              <Link
                to="/admin-operations"
                aria-label="Back to admin operations"
              />
            }
            nativeButton={false}
          >
            Back to operations
          </Button>
          <Heading size="md">Booking detail</Heading>
          <Text className="break-all text-muted">
            {booking.id} · admin review context
          </Text>
        </div>
        <Button onClick={() => setOverrideOpen(true)}>Open override</Button>
      </div>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={getBookingStateVariant(booking.currentState)}>
            {getBookingStateLabel(booking.currentState)}
          </Badge>
          {booking.escalated ? (
            <Badge variant="danger">SLA escalated</Badge>
          ) : null}
          <SlaStatus item={booking} timezone={booking.timezone} />
          <Text className="text-sm text-muted">
            {booking.type} · {booking.modality}
          </Text>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <AdminMetricCard
            label="Session"
            value={formatBookingDate(
              booking.scheduledStartAt,
              booking.timezone,
            )}
          />
          <AdminMetricCard
            label="Urgency"
            value={getUrgencyLabel(booking.currentState)}
          />
          <AdminMetricCard
            label="Confirmation"
            value={`${booking.confirmedHeadcount} of ${booking.targetGroupSize} confirmed`}
          />
          <AdminMetricCard
            label="SLA deadline"
            value={formatSlaDeadline(booking.slaDeadline, booking.timezone)}
          />
        </div>

        {booking.modality === "online" ? (
          <Card>
            <CardHeader>
              <IconBox variant="info-subtle" size="sm">
                <IconCalendarEvent />
              </IconBox>
              <CardTitle>Meeting access</CardTitle>
              <CardDescription>
                Add a trusted meeting URL when automatic Google Meet setup is
                unavailable.
              </CardDescription>
            </CardHeader>
            <CardBody className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <Text className="text-sm text-muted">Current link</Text>
                <Text className="break-all font-medium">
                  {bookingQuery.data?.meetingUrl ??
                    "No meeting link is available yet."}
                </Text>
              </div>
              {canSetManualLink ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setManualLinkDialogOpen(true)}
                >
                  {bookingQuery.data?.meetingUrl
                    ? "Replace link"
                    : "Add meeting link"}
                </Button>
              ) : null}
            </CardBody>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <IconBox variant="danger-subtle" size="sm">
              <IconAlertTriangle />
            </IconBox>
            <CardTitle>Report context</CardTitle>
            <CardDescription>
              Why this booking entered the admin queue and when the response
              window started.
            </CardDescription>
          </CardHeader>
          <CardBody className="grid gap-3 sm:grid-cols-3">
            <AdminMetricRow label="Source" value="Admin override" />
            <AdminMetricRow
              label="Reported"
              value={formatReportedAt(booking.reportedAt, booking.timezone)}
            />
            <AdminMetricRow
              label="Time since report"
              value={formatTimeSince(booking.reportedAt)}
            />
            <div className="sm:col-span-3">
              <Text className="text-sm text-muted">Reported reason</Text>
              <Text className="mt-1 break-words text-sm">
                {getOverrideReason(booking.overrideMeta) ??
                  "No reported reason"}
              </Text>
            </div>
          </CardBody>
        </Card>

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
          <Card>
            <CardHeader>
              <IconBox variant="secondary-subtle" size="sm">
                <IconUsers />
              </IconBox>
              <CardTitle>Participants</CardTitle>
              <CardDescription>
                Hydrated participant roster with confirmation state and
                per-wallet ledger activity.
              </CardDescription>
            </CardHeader>
            <CardBody className="space-y-3">
              {bookingQuery.isPending ? (
                <Text className="text-muted">Loading participant wallets…</Text>
              ) : bookingQuery.isError ? (
                <Text className="text-danger-foreground">
                  Participant detail could not be loaded.
                </Text>
              ) : participants.length > 0 ? (
                participants.map((participant, index) => (
                  <AdminParticipantWalletCard
                    key={participant.id}
                    participant={participant}
                    affected={affectedParticipants.includes(participant.userId)}
                    wallet={walletQueries[index]?.data}
                    walletLoading={walletQueries[index]?.isPending ?? false}
                    ledger={ledgerQueries[index]?.data?.items ?? []}
                    ledgerLoading={ledgerQueries[index]?.isPending ?? false}
                    timezone={booking.timezone}
                  />
                ))
              ) : (
                <EmptyState
                  icon={<IconUsers />}
                  title="No participant records"
                  description="Participant details will appear here when the booking has a roster."
                  size="inline"
                />
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <IconBox variant="warning-subtle" size="sm">
                <IconCoins />
              </IconBox>
              <CardTitle>Wallet impact</CardTitle>
              <CardDescription>
                Booking-level Marks reservation and override context.
              </CardDescription>
            </CardHeader>
            <CardBody className="space-y-2">
              <AdminMetricRow
                label="Original reservation"
                value={`${booking.originalMarks} Marks`}
              />
              <AdminMetricRow
                label="Currently held"
                value={`${booking.holdAmount} Marks`}
              />
              <AdminMetricRow
                label="Refunded"
                value={`${booking.refundedAmount} Marks`}
              />
              <AdminMetricRow
                label="Latest Marks action"
                value={
                  typeof metadata?.marksAction === "string"
                    ? humanize(metadata.marksAction)
                    : "No override action"
                }
              />
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <IconBox variant="info-subtle" size="sm">
              <IconClock />
            </IconBox>
            <CardTitle>State history</CardTitle>
            <CardDescription>
              Every recorded transition, oldest first.
            </CardDescription>
          </CardHeader>
          <CardBody className="px-6 py-2">
            {historyQuery.isPending ? (
              <Text className="py-4 text-muted">Loading state history…</Text>
            ) : historyQuery.isError ? (
              <div className="py-4">
                <Text>
                  {getUserFacingError(
                    historyQuery.error,
                    "State history could not be loaded.",
                  )}
                </Text>
                <Button
                  className="mt-3"
                  size="sm"
                  variant="secondary"
                  onClick={() => void historyQuery.refetch()}
                >
                  Try again
                </Button>
              </div>
            ) : historyQuery.data.length > 0 ? (
              <div className="divide-y divide-border">
                {historyQuery.data.map((entry) => (
                  <AdminHistoryRow
                    key={entry.id}
                    entry={entry}
                    timezone={booking.timezone}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<IconClock />}
                title="No state transitions yet"
                description="Recorded booking changes will appear here."
                size="inline"
              />
            )}
          </CardBody>
        </Card>
      </div>
      <ManualMeetingLinkDialog
        open={manualLinkDialogOpen}
        onOpenChange={setManualLinkDialogOpen}
        onSubmit={(url) =>
          setMeetingLink.mutate({ bookingId: booking.id, url })
        }
        pending={setMeetingLink.isPending}
        initialUrl={bookingQuery.data?.meetingUrl}
        actor="admin"
      />
      <OverrideDialog
        booking={overrideOpen ? booking : null}
        onClose={() => setOverrideOpen(false)}
        onApplied={() => {
          setOverrideOpen(false);
          const participantInvalidations = participants.flatMap(
            (participant) => [
              queryClient.invalidateQueries({
                queryKey: orpc.admin.getWallet.queryKey({
                  input: { userId: participant.userId },
                }),
              }),
              queryClient.invalidateQueries({
                queryKey: orpc.admin.listLedgerEntries.queryKey({
                  input: {
                    userId: participant.userId,
                    bookingId: booking.id,
                    limit: 8,
                  },
                }),
              }),
            ],
          );
          void Promise.all([
            queryClient.invalidateQueries({
              queryKey: orpc.adminBooking.listBookings.key(),
            }),
            queryClient.invalidateQueries({
              queryKey: orpc.adminBooking.getBookingStateHistory.queryKey({
                input: { bookingId: booking.id },
              }),
            }),
            queryClient.invalidateQueries({
              queryKey: orpc.booking.get.queryKey({
                input: { bookingId: booking.id },
              }),
            }),
            ...participantInvalidations,
          ]);
        }}
      />
    </Stack>
  );
}

function AdminMetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardBody className="space-y-1">
        <Text className="text-xs text-muted">{label}</Text>
        <Text className="font-medium">{value}</Text>
      </CardBody>
    </Card>
  );
}

function AdminMetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border pb-2 last:border-b-0 last:pb-0">
      <Text className="text-sm text-muted">{label}</Text>
      <Text className="text-right text-sm font-medium">{value}</Text>
    </div>
  );
}

function AdminParticipantWalletCard({
  participant,
  affected,
  wallet,
  walletLoading,
  ledger,
  ledgerLoading,
  timezone,
}: {
  participant: AdminParticipant;
  affected: boolean;
  wallet?: AdminWallet;
  walletLoading: boolean;
  ledger: AdminLedgerEntry[];
  ledgerLoading: boolean;
  timezone: string;
}) {
  return (
    <div className="rounded-lg border border-item-border bg-item p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Text className="font-medium">
              {participant.user?.name ?? "Unknown participant"}
            </Text>
            <Badge variant="secondary">{humanize(participant.role)}</Badge>
            {affected ? <Badge variant="warning">Affected</Badge> : null}
          </div>
          <Text className="truncate text-xs text-muted">
            User ID: {participant.userId}
          </Text>
          <Text className="break-all font-mono text-[0.65rem] text-dimmed">
            {participant.userId} · {humanize(participant.confirmationState)}
          </Text>
        </div>
        {walletLoading ? (
          <Text className="text-xs text-muted">Loading wallet…</Text>
        ) : wallet ? (
          <div className="grid grid-cols-3 gap-3 text-right">
            <WalletMetric label="Total" value={wallet.totalBalance} />
            <WalletMetric label="Held" value={wallet.heldBalance} />
            <WalletMetric label="Available" value={wallet.availableBalance} />
          </div>
        ) : (
          <Text className="text-xs text-danger-foreground">
            Wallet unavailable
          </Text>
        )}
      </div>
      <div className="mt-3 border-t border-border pt-3">
        <Text className="text-xs font-medium text-muted">Booking ledger</Text>
        {ledgerLoading ? (
          <Text className="mt-1 text-xs text-muted">Loading entries…</Text>
        ) : ledger.length > 0 ? (
          <div className="mt-1 divide-y divide-border">
            {ledger.slice(0, 4).map((entry) => (
              <div
                className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs"
                key={entry.id}
              >
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{humanize(entry.entryType)}</Badge>
                  <Text className="text-muted">
                    {formatBookingDate(entry.createdAt, timezone)}
                  </Text>
                </div>
                <Text className="font-medium">{formatMarks(entry.amount)}</Text>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<IconCoins />}
            title="No ledger entries"
            description="No Marks activity references this booking."
            size="inline"
            className="px-0 py-3"
          />
        )}
      </div>
    </div>
  );
}

function WalletMetric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <Text className="text-[0.65rem] text-muted">{label}</Text>
      <Text className="text-xs font-medium">{formatMarks(value)}</Text>
    </div>
  );
}

function AdminHistoryRow({
  entry,
  timezone,
}: {
  entry: StateHistoryItem;
  timezone: string;
}) {
  return (
    <div className="relative flex gap-3 py-4">
      <IconBox variant="secondary-subtle" size="sm">
        <IconClock />
      </IconBox>
      <div className="min-w-0 flex-1">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Text className="font-medium">
              {entry.fromState
                ? `${getBookingStateLabel(entry.fromState)} → `
                : "Created → "}
              {getBookingStateLabel(entry.toState)}
            </Text>
            <Badge variant="secondary">{humanize(entry.actorType)}</Badge>
          </div>
          <Text className="text-xs text-dimmed">
            {formatBookingDate(entry.createdAt, timezone)}
          </Text>
        </div>
        <Text className="mt-1 break-words text-sm text-muted">
          {entry.reason ?? `Updated by ${humanize(entry.actorType)}`}
        </Text>
        {entry.actorId ? (
          <Text className="mt-1 break-all font-mono text-xs text-dimmed">
            Actor: {entry.actorId}
          </Text>
        ) : null}
      </div>
    </div>
  );
}

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
            <Textarea
              id="override-reason"
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
  const [search, setSearch] = useState("");
  const [submittedSearch, setSubmittedSearch] = useState("");
  const [selectedUser, setSelectedUser] =
    useState<AdminUserSearchResult | null>(null);
  const searchQuery = useQuery({
    ...orpc.admin.searchUsers.queryOptions({
      input: { query: submittedSearch || "--", limit: 10 },
    }),
    enabled: submittedSearch.length >= 2,
  });
  const selectedUserId = selectedUser?.id ?? "";
  const walletQuery = useQuery({
    ...orpc.admin.getWallet.queryOptions({ input: { userId: selectedUserId } }),
    enabled: Boolean(selectedUserId),
  });
  const ledgerQuery = useQuery({
    ...orpc.admin.listLedgerEntries.queryOptions({
      input: { userId: selectedUserId, limit: 50 },
    }),
    enabled: Boolean(selectedUserId) && walletQuery.isSuccess,
  });

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextSearch = search.trim();
    if (nextSearch.length < 2) return;
    setSelectedUser(null);
    setSubmittedSearch(nextSearch);
  }

  return (
    <Stack direction="column" spacing="md">
      <Card>
        <CardHeader>
          <CardTitle>Find a wallet</CardTitle>
          <CardDescription>
            Search by name, email, or user ID, then choose the account to
            inspect.
          </CardDescription>
        </CardHeader>
        <CardBody>
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={submitSearch}
          >
            <Field className="min-w-0 flex-1">
              <FieldLabel className="sr-only" htmlFor="wallet-user-search">
                Search users
              </FieldLabel>
              <Input
                id="wallet-user-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Name, email, or user ID"
                autoComplete="off"
              />
            </Field>
            <Button
              type="submit"
              progress={searchQuery.isFetching}
              disabled={search.trim().length < 2 || searchQuery.isFetching}
            >
              <IconSearch /> Search
            </Button>
          </form>
        </CardBody>
      </Card>

      {submittedSearch && searchQuery.isPending ? (
        <LoadingCard />
      ) : submittedSearch && searchQuery.isError ? (
        <ErrorCard
          title="User search could not be completed"
          message={getUserFacingError(
            searchQuery.error,
            "Matching users could not be loaded.",
          )}
          onRetry={() => void searchQuery.refetch()}
        />
      ) : submittedSearch && searchQuery.data?.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={<IconUsers />}
              title="No matching users"
              description="Try a different name, email, or user ID."
              tone="secondary"
              size="compact"
            />
          </CardBody>
        </Card>
      ) : searchQuery.data?.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Matching users</CardTitle>
            <CardDescription>
              Select an account to load its wallet and latest ledger activity.
            </CardDescription>
          </CardHeader>
          <CardBody className="space-y-2">
            {searchQuery.data.map((user) => (
              <Item
                key={user.id}
                render={
                  <button
                    type="button"
                    onClick={() => setSelectedUser(user)}
                    aria-label={"View wallet for " + user.name}
                    aria-pressed={selectedUserId === user.id}
                  />
                }
                variant={
                  selectedUserId === user.id ? "primary-outline" : "default"
                }
                size="sm"
                className="w-full items-center"
              >
                <ItemMedia>
                  <Avatar size="sm">
                    {user.image ? (
                      <AvatarImage src={user.image} alt="" />
                    ) : null}
                    <AvatarFallback>
                      {getUserInitials(user.name)}
                    </AvatarFallback>
                  </Avatar>
                </ItemMedia>
                <ItemContent className="min-w-0 flex-1">
                  <ItemTitle className="truncate text-sm">
                    {user.name}
                  </ItemTitle>
                  <ItemDescription className="truncate text-xs">
                    {user.email}
                  </ItemDescription>
                </ItemContent>
                <ItemAction>
                  <Badge variant="secondary" pill>
                    {humanize(user.role)}
                  </Badge>
                </ItemAction>
              </Item>
            ))}
          </CardBody>
        </Card>
      ) : null}

      {selectedUser ? (
        <Card>
          <CardHeader>
            <CardTitle>{selectedUser.name}</CardTitle>
            <CardDescription className="break-all">
              {selectedUser.email} · {humanize(selectedUser.role)} ·{" "}
              {selectedUser.id}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {selectedUser && walletQuery.isPending ? <LoadingCard /> : null}
      {selectedUser && walletQuery.isError ? (
        <ErrorCard
          title="Wallet could not be loaded"
          message={getUserFacingError(
            walletQuery.error,
            "The wallet could not be loaded.",
          )}
          onRetry={() => void walletQuery.refetch()}
        />
      ) : selectedUser && walletQuery.data ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <BalanceCard label="Total" value={walletQuery.data.totalBalance} />
          <BalanceCard label="Held" value={walletQuery.data.heldBalance} />
          <BalanceCard
            label="Available"
            value={walletQuery.data.availableBalance}
          />
        </div>
      ) : null}

      {selectedUser && ledgerQuery.isError ? (
        <ErrorCard
          title="Ledger could not be loaded"
          message={getUserFacingError(
            ledgerQuery.error,
            "The wallet was found, but its ledger could not be loaded.",
          )}
          onRetry={() => void ledgerQuery.refetch()}
        />
      ) : null}
      {selectedUser && ledgerQuery.data ? (
        <Card>
          <CardHeader>
            <CardTitle>Ledger</CardTitle>
            <CardDescription>Latest wallet entries</CardDescription>
          </CardHeader>
          <CardBody>
            {ledgerQuery.data.items.length === 0 ? (
              <EmptyState
                icon={<IconCoins />}
                title="No ledger entries"
                description="This wallet has no Marks activity yet."
                tone="secondary"
                size="compact"
              />
            ) : (
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
            )}
          </CardBody>
        </Card>
      ) : null}
    </Stack>
  );
}

type AdminUserSearchResult = Awaited<
  ReturnType<typeof client.admin.searchUsers>
>[number];

type PendingRoomApproval = Awaited<
  ReturnType<typeof client.room.listPendingApprovals>
>[number];

function RoomOperations() {
  const queryClient = useQueryClient();
  const [operation, setOperation] = useState<"assign" | "relocate">("assign");
  const [bookingId, setBookingId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [selectedApproval, setSelectedApproval] =
    useState<PendingRoomApproval | null>(null);
  const roomsQuery = useQuery(
    orpc.room.list.queryOptions({ input: undefined }),
  );
  const pendingQuery = useQuery(
    orpc.room.listPendingApprovals.queryOptions({ input: { limit: 50 } }),
  );
  const invalidateRoomQueries = () => {
    void queryClient.invalidateQueries({ queryKey: orpc.room.list.key() });
    void queryClient.invalidateQueries({
      queryKey: orpc.room.listPendingApprovals.key(),
    });
  };
  const assign = useMutation(
    orpc.room.assign.mutationOptions({
      onSuccess: () => {
        toastManager.add({ title: "Room assigned", type: "success" });
        setSelectedApproval(null);
        invalidateRoomQueries();
      },
      onError: (error: Error) => showError("Room could not be assigned", error),
    }),
  );
  const relocate = useMutation(
    orpc.room.relocate.mutationOptions({
      onSuccess: () => {
        toastManager.add({ title: "Room relocated", type: "success" });
        setSelectedApproval(null);
        invalidateRoomQueries();
      },
      onError: (error: Error) =>
        showError("Room could not be relocated", error),
    }),
  );
  const cancel = useMutation(
    orpc.room.cancelBooking.mutationOptions({
      onSuccess: () => {
        toastManager.add({ title: "Room booking cancelled", type: "success" });
        setSelectedApproval(null);
        invalidateRoomQueries();
      },
      onError: (error: Error) =>
        showError("Room booking could not be cancelled", error),
    }),
  );
  const openApproval = (approval: PendingRoomApproval) => {
    setSelectedApproval(approval);
    setOperation("assign");
    setBookingId(approval.bookingId);
    setRoomId(approval.requestedRoomId ?? "");
    setStartAt(
      toDateTimeLocalInput(approval.scheduledStartAt, approval.timezone),
    );
    setEndAt(toDateTimeLocalInput(approval.scheduledEndAt, approval.timezone));
  };
  const assignRequested = (approval: PendingRoomApproval) => {
    if (!approval.requestedRoomId) {
      openApproval(approval);
      return;
    }
    assign.mutate({
      bookingId: approval.bookingId,
      roomId: approval.requestedRoomId,
      startAt: new Date(approval.scheduledStartAt),
      endAt: new Date(approval.scheduledEndAt),
    });
  };
  const valid =
    bookingId.trim() &&
    roomId &&
    startAt &&
    endAt &&
    new Date(endAt) > new Date(startAt);
  return (
    <Stack direction="column" spacing="md">
      <PendingRoomApprovals
        items={pendingQuery.data ?? []}
        isPending={pendingQuery.isPending}
        errorMessage={
          pendingQuery.isError
            ? getUserFacingError(
                pendingQuery.error,
                "Pending room approvals could not be loaded.",
              )
            : null
        }
        onRetry={() => void pendingQuery.refetch()}
        onRefresh={() => void pendingQuery.refetch()}
        onAssignRequested={assignRequested}
        onOpenForm={openApproval}
        onCancel={(id) => cancel.mutate({ bookingId: id })}
        isActionPending={assign.isPending || cancel.isPending}
      />
      <Card>
        <CardHeader>
          <CardTitle>Offline room assignment</CardTitle>
          <CardDescription>
            {selectedApproval
              ? `Managing pending booking ${selectedApproval.bookingId}.`
              : "Assign or relocate an active room to an offline booking."}
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
            <FieldDescription>
              {roomsQuery.isPending
                ? "Loading rooms…"
                : roomsQuery.isError
                  ? "Rooms could not be loaded."
                  : roomsQuery.data?.length === 0
                    ? "No rooms are available yet. Add a room before assigning an offline booking."
                    : "Choose the room for this offline booking."}
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="room-start-date">Start</FieldLabel>
            <CrossBrowserDateTimeInput
              id="room-start"
              timeAriaLabel="Start time"
              value={startAt}
              onChange={setStartAt}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="room-end-date">End</FieldLabel>
            <CrossBrowserDateTimeInput
              id="room-end"
              timeAriaLabel="End time"
              value={endAt}
              onChange={setEndAt}
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

function PendingRoomApprovals({
  items,
  isPending,
  errorMessage,
  onRetry,
  onRefresh,
  onAssignRequested,
  onOpenForm,
  onCancel,
  isActionPending,
}: {
  items: PendingRoomApproval[];
  isPending: boolean;
  errorMessage: string | null;
  onRetry: () => void;
  onRefresh: () => void;
  onAssignRequested: (approval: PendingRoomApproval) => void;
  onOpenForm: (approval: PendingRoomApproval) => void;
  onCancel: (bookingId: string) => void;
  isActionPending: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex-wrap">
        <div className="min-w-0 flex-1">
          <CardTitle>Pending room approvals</CardTitle>
          <CardDescription>
            Offline bookings accepted by a tutor and waiting for an admin room
            decision.
          </CardDescription>
        </div>
        <Button
          size="sm"
          variant="plain"
          onClick={onRefresh}
          disabled={isPending}
        >
          <IconRefresh /> Refresh
        </Button>
      </CardHeader>
      <CardBody>
        {isPending ? (
          <div className="min-h-32 animate-pulse rounded-lg bg-accent/30" />
        ) : errorMessage ? (
          <div className="flex flex-col items-start gap-3">
            <Text className="text-muted">{errorMessage}</Text>
            <Button size="sm" variant="secondary" onClick={onRetry}>
              Try again
            </Button>
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<IconCheck />}
            title="No pending room approvals"
            description="Tutor-accepted offline bookings will appear here."
            tone="secondary"
            size="compact"
          />
        ) : (
          <TableContainer>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Booking</TableHead>
                  <TableHead>Session</TableHead>
                  <TableHead>Requested room</TableHead>
                  <TableHead>Participants</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.bookingId}>
                    <TableCell>
                      <Text className="font-mono text-xs">
                        {item.bookingId}
                      </Text>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <Badge variant="warning">Room approval</Badge>
                        <Badge variant="secondary">{item.bookingType}</Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      {formatBookingDate(item.scheduledStartAt, item.timezone)}
                    </TableCell>
                    <TableCell>
                      {item.requestedRoomName ? (
                        <>
                          <Text>{item.requestedRoomName}</Text>
                          <Text className="text-xs text-muted">
                            {item.requestedRoomLocation}
                          </Text>
                        </>
                      ) : (
                        <Text className="text-xs text-muted">
                          No room available from the original request
                        </Text>
                      )}
                    </TableCell>
                    <TableCell>
                      {item.confirmedHeadcount}/{item.targetGroupSize}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap justify-end gap-1">
                        {item.requestedRoomId ? (
                          <Button
                            size="sm"
                            onClick={() => onAssignRequested(item)}
                            progress={isActionPending}
                            disabled={isActionPending}
                          >
                            <IconCheck /> Assign
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => onOpenForm(item)}
                          disabled={isActionPending}
                        >
                          {item.requestedRoomId
                            ? "Choose another"
                            : "Choose room"}
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => onCancel(item.bookingId)}
                          progress={isActionPending}
                          disabled={isActionPending}
                        >
                          Cancel
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </CardBody>
    </Card>
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
  title = "Operations data could not be loaded",
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry: () => void;
}) {
  return (
    <Card>
      <CardBody className="flex min-h-48 flex-col items-center justify-center text-center">
        <IconBox variant="danger-subtle">
          <IconAlertTriangle />
        </IconBox>
        <Text className="mt-3">{title}</Text>
        <Text className="mt-1 text-muted">{message}</Text>
        <Button className="mt-4" variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      </CardBody>
    </Card>
  );
}
function getOverrideMetadata(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}
function getOverrideCategory(value: unknown) {
  const category = getOverrideMetadata(value)?.category;
  return typeof category === "string" ? category : null;
}
function getOverrideReason(value: unknown) {
  const reason = getOverrideMetadata(value)?.reason;
  return typeof reason === "string" && reason.trim() ? reason : null;
}
function getStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}
function getUrgencyLabel(state: string) {
  if (
    [
      "awaiting_tutor_review",
      "awaiting_participant_confirmation",
      "awaiting_reconfirmation",
      "reschedule_proposed",
      "awaiting_admin_room_approval",
    ].includes(state)
  ) {
    return "High";
  }
  if (["confirmed", "scheduled"].includes(state)) return "Medium";
  return "Low";
}
function humanize(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function getUserInitials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "CG"
  );
}

function SlaStatus({
  item,
  timezone,
}: {
  item: Pick<QueueItem, "escalated" | "reportedAt" | "slaDeadline">;
  timezone: string;
}) {
  if (!item.slaDeadline) {
    return <Text className="text-sm text-muted">Not reported</Text>;
  }

  return (
    <div className="min-w-32 space-y-1">
      <Badge
        className="whitespace-nowrap"
        variant={item.escalated ? "danger" : "success"}
      >
        {item.escalated ? "Expired" : "Within SLA"}
      </Badge>
      <Text className="text-sm text-muted">
        Due {formatReportedAt(item.slaDeadline, timezone)}
      </Text>
      <Text className="text-sm text-dimmed">
        {formatTimeSince(item.reportedAt)}
      </Text>
      {item.escalated ? (
        <WhatsAppSupportDialog
          trigger={
            <Button
              variant="underline"
              size="xs"
              aria-label="Escalate this booking via WhatsApp"
              className="text-xs font-medium"
            >
              WhatsApp escalation
            </Button>
          }
        />
      ) : null}
    </div>
  );
}

function formatReportedAt(value: string | Date | null, timezone: string) {
  return value ? formatBookingDate(value, timezone) : "Not reported";
}

function formatSlaDeadline(value: string | Date | null, timezone: string) {
  if (!value) return "Not reported";
  return formatBookingDate(value, timezone);
}

function formatTimeSince(value: string | Date | null) {
  if (!value) return "No active report";
  const elapsedMs = Math.max(0, Date.now() - new Date(value).getTime());
  const elapsedMinutes = Math.floor(elapsedMs / 60_000);
  if (elapsedMinutes < 60) return `${elapsedMinutes}m since report`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}h since report`;
  return `${Math.floor(elapsedHours / 24)}d since report`;
}

function formatMarks(value: number) {
  return `${new Intl.NumberFormat("id-ID").format(value)} Marks`;
}

function toDateTimeLocalInput(value: string | Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    calendar: "iso8601",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(new Date(value))
    .reduce<Record<string, string>>((result, part) => {
      if (part.type !== "literal") result[part.type] = part.value;
      return result;
    }, {});

  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function showError(title: string, error: Error) {
  toastManager.add({
    title,
    description: getUserFacingError(error),
    type: "error",
  });
}
