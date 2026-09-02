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
  IconArrowLeft,
  IconBuilding,
  IconCalendarEvent,
  IconCheck,
  IconClock,
  IconCoins,
  IconPlus,
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
import { NumberField } from "@cogito-app/ui/components/selia/number-field";
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
import { AdminRoomActions } from "@/components/booking/admin-room-actions";
import { BookingDetailPage } from "@/components/booking/booking-detail-page";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { client, orpc } from "@/utils/orpc";
import { getUserFacingError } from "@/lib/error-message";
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
            <IconBuilding /> Room approvals
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

export function AdminBookingDetailPage({
  bookingId,
  viewerId,
}: {
  bookingId: string;
  viewerId: string;
}) {
  const queryClient = useQueryClient();
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

  function invalidateBookingDetailQueries() {
    void Promise.all([
      queryClient.invalidateQueries({
        queryKey: orpc.adminBooking.listBookings.key(),
      }),
      queryClient.invalidateQueries({
        queryKey: orpc.adminBooking.getBookingStateHistory.queryKey({
          input: { bookingId: booking?.id ?? bookingId },
        }),
      }),
      queryClient.invalidateQueries({
        queryKey: orpc.booking.get.queryKey({
          input: { bookingId: booking?.id ?? bookingId },
        }),
      }),
      queryClient.invalidateQueries({
        queryKey: orpc.room.listPendingApprovals.key(),
      }),
    ]);
  }

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
            variant="underline"
            render={
              <Link
                to="/admin-operations"
                aria-label="Back to admin operations"
              />
            }
            nativeButton={false}
          >
            <IconArrowLeft />
            Back to operations
          </Button>
        </CardFooter>
      </Card>
    );
  }

  const adminMainContent = (
    <>
      {booking.modality === "offline" && bookingQuery.data ? (
        <AdminRoomActions
          booking={bookingQuery.data}
          onBookingChanged={invalidateBookingDetailQueries}
        />
      ) : null}
      <AdminReviewContextCard booking={booking} />
      <AdminParticipantFinancialsCard
        participants={participants}
        walletQueries={walletQueries}
        ledgerQueries={ledgerQueries}
        affectedParticipants={affectedParticipants}
        timezone={booking.timezone}
        loading={bookingQuery.isPending}
        error={bookingQuery.isError}
      />
    </>
  );
  const adminSidebarContent = (
    <AdminWalletImpactCard booking={booking} metadata={metadata} />
  );
  const adminActivityContent = (
    <AdminStateHistoryCard
      entries={historyQuery.data ?? []}
      loading={historyQuery.isPending}
      error={historyQuery.isError}
      errorMessage={
        historyQuery.isError
          ? getUserFacingError(
              historyQuery.error,
              "State history could not be loaded.",
            )
          : undefined
      }
      onRetry={() => void historyQuery.refetch()}
      timezone={booking.timezone}
    />
  );

  return (
    <>
      <BookingDetailPage
        bookingId={booking.id}
        viewerId={viewerId}
        viewerRole="admin"
        backTo="/admin-operations"
        backLabel="admin operations"
        initialBooking={bookingQuery.data}
        extensions={{
          headerActions: (
            <Button size="sm" onClick={() => setOverrideOpen(true)}>
              <IconAlertTriangle /> Open override
            </Button>
          ),
          main: adminMainContent,
          sidebar: adminSidebarContent,
          activity: adminActivityContent,
        }}
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
    </>
  );
}

function AdminReviewContextCard({ booking }: { booking: QueueItem }) {
  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader>
        <IconBox variant="danger-subtle" size="sm">
          <IconAlertTriangle />
        </IconBox>
        <CardTitle>Admin review context</CardTitle>
        <CardDescription>
          Why this booking entered the admin queue and when the response window
          started.
        </CardDescription>
      </CardHeader>
      <CardBody className="grid gap-3 sm:grid-cols-2">
        <AdminMetricRow label="Source" value="Admin override" />
        <AdminMetricRow
          label="Urgency"
          value={getUrgencyLabel(booking.currentState)}
        />
        <AdminMetricRow
          label="Reported"
          value={formatReportedAt(booking.reportedAt, booking.timezone)}
        />
        <div className="sm:col-span-2">
          <Text className="text-sm text-muted">SLA status</Text>
          <div className="mt-1">
            <SlaStatus item={booking} timezone={booking.timezone} />
          </div>
        </div>
        <div className="sm:col-span-2">
          <Text className="text-sm text-muted">Reported reason</Text>
          <Text className="mt-1 break-words text-sm">
            {getOverrideReason(booking.overrideMeta) ?? "No reported reason"}
          </Text>
        </div>
      </CardBody>
    </Card>
  );
}

function AdminParticipantFinancialsCard({
  participants,
  walletQueries,
  ledgerQueries,
  affectedParticipants,
  timezone,
  loading,
  error,
}: {
  participants: AdminParticipant[];
  walletQueries: Array<{ data?: AdminWallet; isPending: boolean }>;
  ledgerQueries: Array<{ data?: AdminLedgerPage; isPending: boolean }>;
  affectedParticipants: string[];
  timezone: string;
  loading: boolean;
  error: boolean;
}) {
  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader>
        <IconBox variant="secondary-subtle" size="sm">
          <IconUsers />
        </IconBox>
        <CardTitle>Participant financials</CardTitle>
        <CardDescription>
          Participant roster with wallet balances and booking ledger activity.
        </CardDescription>
      </CardHeader>
      <CardBody className="space-y-3">
        {loading ? (
          <Text className="text-muted">Loading participant wallets…</Text>
        ) : error ? (
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
              timezone={timezone}
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
  );
}

function AdminWalletImpactCard({
  booking,
  metadata,
}: {
  booking: QueueItem;
  metadata: Record<string, unknown> | null;
}) {
  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader>
        <IconBox variant="warning" size="sm">
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
          value={formatMarks(booking.originalMarks) + " Marks"}
        />
        <AdminMetricRow
          label="Currently held"
          value={formatMarks(booking.holdAmount) + " Marks"}
        />
        <AdminMetricRow
          label="Refunded"
          value={formatMarks(booking.refundedAmount) + " Marks"}
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
  );
}

function AdminStateHistoryCard({
  entries,
  loading,
  error,
  errorMessage,
  onRetry,
  timezone,
}: {
  entries: StateHistoryItem[];
  loading: boolean;
  error: boolean;
  errorMessage?: string;
  onRetry: () => void;
  timezone: string;
}) {
  return (
    <Card className="min-w-0 overflow-hidden">
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
        {loading ? (
          <Text className="py-4 text-muted">Loading state history…</Text>
        ) : error ? (
          <div className="py-4">
            <Text>{errorMessage ?? "State history could not be loaded."}</Text>
            <Button
              className="mt-3"
              size="sm"
              variant="secondary"
              onClick={onRetry}
            >
              Try again
            </Button>
          </div>
        ) : entries.length > 0 ? (
          <div className="divide-y divide-border">
            {entries.map((entry) => (
              <AdminHistoryRow
                key={entry.id}
                entry={entry}
                timezone={timezone}
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
  const [createRoomOpen, setCreateRoomOpen] = useState(false);
  const [cancelApproval, setCancelApproval] =
    useState<PendingRoomApproval | null>(null);
  const pendingQuery = useQuery(
    orpc.room.listPendingApprovals.queryOptions({ input: { limit: 50 } }),
  );
  const invalidateRoomQueries = () => {
    void Promise.all([
      queryClient.invalidateQueries({
        queryKey: orpc.room.listPendingApprovals.key(),
      }),
      queryClient.invalidateQueries({
        queryKey: orpc.booking.get.key(),
      }),
      queryClient.invalidateQueries({
        queryKey: orpc.booking.listMine.key(),
      }),
    ]);
  };
  const assign = useMutation(
    orpc.room.assign.mutationOptions({
      onSuccess: () => {
        toastManager.add({ title: "Room assigned", type: "success" });
        invalidateRoomQueries();
      },
      onError: (error: Error) => showError("Room could not be assigned", error),
    }),
  );
  const cancel = useMutation(
    orpc.room.cancelBooking.mutationOptions({
      onSuccess: () => {
        setCancelApproval(null);
        toastManager.add({
          title: "Offline booking cancelled",
          type: "success",
        });
        invalidateRoomQueries();
      },
      onError: (error: Error) =>
        showError("Room booking could not be cancelled", error),
    }),
  );
  const assignRequested = (approval: PendingRoomApproval) => {
    if (!approval.requestedRoomId) return;
    assign.mutate({
      bookingId: approval.bookingId,
      roomId: approval.requestedRoomId,
      startAt: new Date(approval.scheduledStartAt),
      endAt: new Date(approval.scheduledEndAt),
    });
  };
  return (
    <>
      <Stack direction="column" spacing="md">
        <RoomCatalog onAddRoom={() => setCreateRoomOpen(true)} />
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
          onCancel={setCancelApproval}
          isActionPending={assign.isPending || cancel.isPending}
        />
      </Stack>
      <CreateRoomDialog
        open={createRoomOpen}
        onOpenChange={setCreateRoomOpen}
      />
      <ConfirmationDialog
        open={cancelApproval !== null}
        onOpenChange={(open) => {
          if (!open && !cancel.isPending) setCancelApproval(null);
        }}
        title="Cancel this offline booking?"
        description={
          cancelApproval
            ? `This will cancel the booking scheduled for ${formatBookingDate(cancelApproval.scheduledStartAt, cancelApproval.timezone)}, release held Marks, and notify the tutor and confirmed students.`
            : "This will cancel the offline booking and release its held Marks."
        }
        confirmLabel="Cancel booking"
        confirmVariant="danger"
        pending={cancel.isPending}
        onConfirm={() => {
          if (cancelApproval) {
            cancel.mutate({ bookingId: cancelApproval.bookingId });
          }
        }}
      />
    </>
  );
}

function RoomCatalog({ onAddRoom }: { onAddRoom: () => void }) {
  const roomsQuery = useQuery(
    orpc.room.list.queryOptions({ input: undefined }),
  );

  return (
    <Card>
      <CardHeader className="flex-wrap">
        <div className="min-w-0 flex-1">
          <CardTitle>Active rooms</CardTitle>
          <CardDescription>
            Rooms shown here are available for offline booking and assignment.
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            size="sm"
            variant="plain"
            onClick={() => void roomsQuery.refetch()}
            disabled={roomsQuery.isFetching}
          >
            <IconRefresh /> Refresh
          </Button>
          <Button size="sm" onClick={onAddRoom}>
            <IconPlus /> Add room
          </Button>
        </div>
      </CardHeader>
      <CardBody>
        {roomsQuery.isPending ? (
          <div className="min-h-24 animate-pulse rounded-lg bg-accent/30" />
        ) : roomsQuery.isError ? (
          <div className="flex flex-col items-start gap-3">
            <Text className="text-muted">
              {getUserFacingError(
                roomsQuery.error,
                "Active rooms could not be loaded.",
              )}
            </Text>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void roomsQuery.refetch()}
            >
              Try again
            </Button>
          </div>
        ) : roomsQuery.data.length === 0 ? (
          <EmptyState
            icon={<IconBuilding />}
            title="No active rooms"
            description="Add a room before creating or assigning an offline booking."
            tone="secondary"
            size="compact"
          />
        ) : (
          <TableContainer>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Room</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Capacity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roomsQuery.data.map((room) => (
                  <TableRow key={room.id}>
                    <TableCell>
                      <Text className="font-medium">{room.name}</Text>
                    </TableCell>
                    <TableCell>{room.location}</TableCell>
                    <TableCell>{room.capacity} seats</TableCell>
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

function CreateRoomDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [capacity, setCapacity] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  function resetForm() {
    setName("");
    setLocation("");
    setCapacity(null);
    setFormError(null);
  }

  const create = useMutation(
    orpc.room.create.mutationOptions({
      onSuccess: () => {
        void queryClient.invalidateQueries({
          queryKey: orpc.room.list.key(),
        });
        toastManager.add({
          title: "Room added",
          description: "The room is now available for offline bookings.",
          type: "success",
        });
        resetForm();
        onOpenChange(false);
      },
      onError: (error: Error) => showError("Room could not be added", error),
    }),
  );

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();

    const trimmedName = name.trim();
    const trimmedLocation = location.trim();
    if (!trimmedName) {
      setFormError("Enter a room name.");
      return;
    }
    if (!trimmedLocation) {
      setFormError("Enter a room location.");
      return;
    }
    if (capacity === null || !Number.isSafeInteger(capacity) || capacity < 1) {
      setFormError("Capacity must be a whole number greater than zero.");
      return;
    }
    if (trimmedName.length > 255 || trimmedLocation.length > 255) {
      setFormError("Room name and location must be 255 characters or fewer.");
      return;
    }

    setFormError(null);
    create.mutate({
      name: trimmedName,
      location: trimmedLocation,
      capacity,
    });
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && !create.isPending) resetForm();
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogPopup className="max-w-lg">
        <DialogHeader className="flex-col items-start gap-1.5">
          <DialogTitle>Add room</DialogTitle>
          <DialogDescription>
            Add an active physical room for offline bookings. Capacity is the
            maximum number of learners.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="min-h-0">
          {formError ? (
            <Text className="mb-4 text-danger" role="alert">
              {formError}
            </Text>
          ) : null}
          <form id="create-room-form" onSubmit={submit}>
            <Stack direction="column" spacing="md">
              <Field>
                <FieldLabel htmlFor="create-room-name">Room name</FieldLabel>
                <Input
                  id="create-room-name"
                  name="name"
                  value={name}
                  maxLength={255}
                  required
                  placeholder="e.g. Classroom A"
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="create-room-location">Location</FieldLabel>
                <Input
                  id="create-room-location"
                  name="location"
                  value={location}
                  maxLength={255}
                  required
                  placeholder="e.g. Jakarta Selatan"
                  onChange={(event) => setLocation(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="create-room-capacity">Capacity</FieldLabel>
                <NumberField
                  id="create-room-capacity"
                  value={capacity}
                  min={1}
                  step={1}
                  allowOutOfRange
                  inputProps={{
                    name: "capacity",
                    inputMode: "numeric",
                    required: true,
                  }}
                  onValueChange={setCapacity}
                />
                <FieldDescription>
                  Enter the maximum number of learners this room can hold.
                </FieldDescription>
              </Field>
            </Stack>
          </form>
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => handleOpenChange(false)}
            disabled={create.isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form="create-room-form"
            progress={create.isPending}
            disabled={create.isPending}
          >
            <IconPlus /> Add room
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

function PendingRoomApprovals({
  items,
  isPending,
  errorMessage,
  onRetry,
  onRefresh,
  onAssignRequested,
  onCancel,
  isActionPending,
}: {
  items: PendingRoomApproval[];
  isPending: boolean;
  errorMessage: string | null;
  onRetry: () => void;
  onRefresh: () => void;
  onAssignRequested: (approval: PendingRoomApproval) => void;
  onCancel: (approval: PendingRoomApproval) => void;
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
                          render={
                            <Link
                              to="/admin-operations/bookings/$bookingId"
                              params={{ bookingId: item.bookingId }}
                              aria-label={
                                item.requestedRoomId
                                  ? "Choose another room for this booking"
                                  : "Choose a room for this booking"
                              }
                            />
                          }
                          nativeButton={false}
                          disabled={isActionPending}
                        >
                          {item.requestedRoomId
                            ? "Choose another"
                            : "Choose room"}
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => onCancel(item)}
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

function showError(title: string, error: Error) {
  toastManager.add({
    title,
    description: getUserFacingError(error),
    type: "error",
  });
}
