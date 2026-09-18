"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Card,
  CardBody,
  CardHeader,
  CardHeaderAction,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerFooter,
  DrawerHeader,
  DrawerPopup,
  DrawerTitle,
} from "@cogito-app/ui/components/selia/drawer";
import { DatePicker } from "@cogito-app/ui/components/selia/date-picker";
import { Field, FieldLabel } from "@cogito-app/ui/components/selia/field";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import {
  Select,
  SelectItem,
  SelectList,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@cogito-app/ui/components/selia/select";
import { Text } from "@cogito-app/ui/components/selia/text";
import { toastManager } from "@cogito-app/ui/components/selia/toast";
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
  IconCoins,
  IconDownload,
  IconInbox,
  IconRefresh,
  IconX,
} from "@tabler/icons-react";

import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { EmptyState } from "@/components/empty-state";
import { getUserFacingError } from "@/lib/error-message";
import { client, orpc } from "@/utils/orpc";

const NON_BCA_TRANSFER_FEE_IDR = 2_500;
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const QUICK_RANGE_DAYS = [7, 30, 90] as const;

type PayoutReportRow = Awaited<
  ReturnType<typeof client.admin.getTutorPayoutReport>
>[number];
type StatusFilter = "pending" | "paid" | "all";
type SortOption = "needs_payment" | "amount_desc" | "name" | "latest";
const EMPTY_PAYOUT_ROWS: PayoutReportRow[] = [];

function formatIdr(value: number) {
  return "Rp" + value.toLocaleString("id-ID");
}

function formatDate(value: Date | string | null) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeZone: "Asia/Jakarta",
  }).format(date);
}

function formatDateKey(value: string) {
  return formatDate(new Date(value + "T00:00:00+07:00"));
}

function toWibDateKey(value: Date) {
  const wibDate = new Date(value.getTime() + WIB_OFFSET_MS);
  return [
    wibDate.getUTCFullYear(),
    String(wibDate.getUTCMonth() + 1).padStart(2, "0"),
    String(wibDate.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function shiftDateKey(value: string, days: number) {
  const date = new Date(value + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function toWibStartIso(value: string) {
  return new Date(value + "T00:00:00+07:00").toISOString();
}

function toWibEndIso(value: string) {
  return new Date(value + "T23:59:59.999+07:00").toISOString();
}

function getDefaultRange() {
  const to = toWibDateKey(new Date());
  return { from: shiftDateKey(to, -29), to };
}

function getTransferFee(profileBankName: string | null, gross: number) {
  const bankName = profileBankName?.trim();
  return gross > 0 && bankName?.toUpperCase() !== "BCA"
    ? NON_BCA_TRANSFER_FEE_IDR
    : 0;
}

function statusLabel(row: PayoutReportRow) {
  return row.status === "paid" ? "Transferred" : "Not transferred";
}

function statusVariant(row: PayoutReportRow) {
  return row.status === "paid" ? "success" : "warning";
}

function payoutDateSortValue(value: Date | string | null) {
  if (!value) return Number.NEGATIVE_INFINITY;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp;
}

function payoutPaymentPriority(row: PayoutReportRow) {
  return row.status === "pending" ? (row.payoutAccountComplete ? 0 : 1) : 2;
}

function csvCell(value: string | number | null) {
  const text = value === null ? "" : String(value);
  return '"' + text.replaceAll('"', '""') + '"';
}

function buildPayoutCsv(rows: PayoutReportRow[]) {
  const headers = [
    "Tutor name",
    "Bank",
    "Account number",
    "Account holder",
    "Gross honorarium",
    "Deduction",
    "Transfer amount",
    "Transfer status",
    "Transfer date",
  ];
  const body = rows.map((row) => [
    row.tutorName,
    row.bankName,
    row.bankAccountNumber,
    row.bankAccountHolderName,
    row.grossHonorariumIdr,
    row.transferFeeIdr,
    row.netHonorariumIdr,
    statusLabel(row),
    row.paidAt ? formatDate(row.paidAt) : null,
  ]);
  return (
    "\uFEFF" +
    [headers, ...body].map((row) => row.map(csvCell).join(",")).join("\r\n")
  );
}

function downloadPayoutCsv(rows: PayoutReportRow[], from: string, to: string) {
  const blob = new Blob([buildPayoutCsv(rows)], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "tutor-payouts-" + from + "-to-" + to + ".csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function PayoutDetail({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="min-w-0">
      <Text className="text-xs uppercase tracking-wide text-dimmed">
        {label}
      </Text>
      <Text
        className={
          valueClassName
            ? "mt-1 break-words font-medium " + valueClassName
            : "mt-1 break-words font-medium"
        }
      >
        {value}
      </Text>
    </div>
  );
}

export function AdminTutorPayoutsPage() {
  const queryClient = useQueryClient();
  const defaultRange = useMemo(() => getDefaultRange(), []);
  const [draftFrom, setDraftFrom] = useState(defaultRange.from);
  const [draftTo, setDraftTo] = useState(defaultRange.to);
  const [appliedRange, setAppliedRange] = useState(defaultRange);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [sortOption, setSortOption] = useState<SortOption>("needs_payment");
  const [selectedRow, setSelectedRow] = useState<PayoutReportRow | null>(null);
  const [confirmPaymentOpen, setConfirmPaymentOpen] = useState(false);

  const reportQuery = useQuery({
    ...orpc.admin.getTutorPayoutReport.queryOptions({
      input: {
        dateFrom: toWibStartIso(appliedRange.from),
        dateTo: toWibEndIso(appliedRange.to),
      },
    }),
  });
  const reportRows = reportQuery.data ?? EMPTY_PAYOUT_ROWS;
  const visibleRows = useMemo(() => {
    const filtered = reportRows.filter(
      (row) => statusFilter === "all" || row.status === statusFilter,
    );
    return filtered.toSorted((a, b) => {
      if (sortOption === "needs_payment") {
        const priorityDifference =
          payoutPaymentPriority(a) - payoutPaymentPriority(b);
        if (priorityDifference !== 0) return priorityDifference;
        return b.netHonorariumIdr - a.netHonorariumIdr;
      }
      if (sortOption === "amount_desc") {
        return b.netHonorariumIdr - a.netHonorariumIdr;
      }
      if (sortOption === "name") {
        return a.tutorName.localeCompare(b.tutorName, "id");
      }
      return payoutDateSortValue(b.paidAt) - payoutDateSortValue(a.paidAt);
    });
  }, [reportRows, sortOption, statusFilter]);

  const selectedPendingQuery = useQuery({
    ...orpc.admin.getPendingTutorPayouts.queryOptions({
      input: { tutorId: selectedRow?.tutorId ?? "" },
    }),
    enabled: selectedRow?.status === "pending" && Boolean(selectedRow.tutorId),
  });

  const markPayoutMutation = useMutation(
    orpc.admin.markTutorPayoutPaid.mutationOptions({
      onSuccess: () => {
        setConfirmPaymentOpen(false);
        setSelectedRow(null);
        void queryClient.invalidateQueries({
          queryKey: orpc.admin.getTutorPayoutReport.key(),
        });
        void queryClient.invalidateQueries({
          queryKey: orpc.admin.getPendingTutorPayouts.key(),
        });
        toastManager.add({
          title: "Tutor payout marked as paid",
          description: "The payout report has been refreshed.",
          type: "success",
        });
      },
      onError: (error: unknown) => {
        toastManager.add({
          title: "Tutor payout could not be marked paid",
          description: getUserFacingError(error),
          type: "error",
        });
      },
    }),
  );

  const selectedCurrentGross =
    selectedRow?.status === "pending" && selectedPendingQuery.data
      ? selectedPendingQuery.data.tutorPayoutIdr
      : (selectedRow?.grossHonorariumIdr ?? 0);
  const selectedTransferFee = selectedRow
    ? selectedRow.status === "paid"
      ? selectedRow.transferFeeIdr
      : getTransferFee(selectedRow.bankName, selectedCurrentGross)
    : 0;
  const selectedNetHonorarium = Math.max(
    0,
    selectedCurrentGross - selectedTransferFee,
  );
  const canMarkSelectedPayout = Boolean(
    selectedRow?.status === "pending" &&
    !selectedPendingQuery.isPending &&
    !selectedPendingQuery.isError &&
    selectedPendingQuery.data &&
    selectedCurrentGross > 0 &&
    selectedRow.payoutAccountComplete,
  );

  const dateRangeError =
    !draftFrom || !draftTo
      ? "Select both a start and end date."
      : draftFrom > draftTo
        ? "The start date cannot be after the end date."
        : null;

  function applyDateRange() {
    if (dateRangeError) return;
    setAppliedRange({ from: draftFrom, to: draftTo });
    setSelectedRow(null);
  }

  function setQuickRange(days: number) {
    const to = toWibDateKey(new Date());
    const from = shiftDateKey(to, -(days - 1));
    setDraftFrom(from);
    setDraftTo(to);
    setAppliedRange({ from, to });
    setSelectedRow(null);
  }

  function refreshPayouts() {
    void reportQuery.refetch();
  }

  function closePayoutDetails() {
    if (confirmPaymentOpen || markPayoutMutation.isPending) return;
    setSelectedRow(null);
  }

  function markSelectedPayoutPaid() {
    if (!selectedRow || !canMarkSelectedPayout) return;
    markPayoutMutation.mutate({ tutorId: selectedRow.tutorId });
  }

  function handleDownload() {
    if (visibleRows.length === 0) return;
    downloadPayoutCsv(visibleRows, appliedRange.from, appliedRange.to);
    toastManager.add({
      title: "Payout sheet downloaded",
      description:
        visibleRows.length + " row(s) exported based on the active filters.",
      type: "success",
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Heading level={1} size="md">
            Tutor Payouts
          </Heading>
          <Text className="mt-1 max-w-3xl text-muted">
            Track outstanding honorarium, transfer history, and tutor bank
            details in one place.
          </Text>
        </div>
        <Button
          size="sm"
          variant="secondary"
          progress={reportQuery.isFetching}
          onClick={refreshPayouts}
        >
          <IconRefresh />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Payout filters</CardTitle>
            <Text className="mt-1 text-sm text-muted">
              Refine the history period, transfer status, and sort order.
            </Text>
          </div>
        </CardHeader>
        <CardBody className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field>
              <FieldLabel htmlFor="payout-report-from">Start date</FieldLabel>
              <DatePicker
                id="payout-report-from"
                value={draftFrom}
                onChange={setDraftFrom}
                maxDate={draftTo}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="payout-report-to">End date</FieldLabel>
              <DatePicker
                id="payout-report-to"
                value={draftTo}
                onChange={setDraftTo}
                minDate={draftFrom}
              />
            </Field>
            <Field>
              <FieldLabel>Transfer status</FieldLabel>
              <Select
                value={statusFilter}
                onValueChange={(value) =>
                  setStatusFilter(value as StatusFilter)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectPopup>
                  <SelectList>
                    <SelectItem value="pending">Not transferred</SelectItem>
                    <SelectItem value="paid">Transferred</SelectItem>
                    <SelectItem value="all">All statuses</SelectItem>
                  </SelectList>
                </SelectPopup>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Sort by</FieldLabel>
              <Select
                value={sortOption}
                onValueChange={(value) => setSortOption(value as SortOption)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select sort order" />
                </SelectTrigger>
                <SelectPopup>
                  <SelectList>
                    <SelectItem value="needs_payment">
                      Payment priority
                    </SelectItem>
                    <SelectItem value="amount_desc">Highest amount</SelectItem>
                    <SelectItem value="name">Tutor name</SelectItem>
                    <SelectItem value="latest">Latest transfer</SelectItem>
                  </SelectList>
                </SelectPopup>
              </Select>
            </Field>
          </div>

          <div className="flex flex-col gap-4 border-t border-card-separator pt-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <Text className="text-xs font-semibold uppercase tracking-wide text-dimmed">
                Quick ranges
              </Text>
              <div className="flex flex-wrap gap-2">
                {QUICK_RANGE_DAYS.map((days) => (
                  <Button
                    key={days}
                    size="sm"
                    variant="secondary"
                    onClick={() => setQuickRange(days)}
                  >
                    {days} days
                  </Button>
                ))}
              </div>
            </div>
            <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center lg:justify-end">
              {dateRangeError ? (
                <Text className="text-sm text-danger">{dateRangeError}</Text>
              ) : (
                <Text className="max-w-xl text-sm text-muted">
                  History follows the transfer date. Outstanding balances stay
                  visible from the tutor&apos;s latest payout onward.
                </Text>
              )}
              <Button
                className="shrink-0"
                disabled={Boolean(dateRangeError)}
                onClick={applyDateRange}
              >
                Apply date range
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card id="admin-tutor-payouts" className="scroll-mt-4">
        <CardHeader>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>Tutor payout list</CardTitle>
              <Badge variant="secondary">{visibleRows.length} records</Badge>
            </div>
            <Text className="mt-1 text-sm text-muted">
              Period: {formatDateKey(appliedRange.from)} to{" "}
              {formatDateKey(appliedRange.to)}
            </Text>
          </div>
          <CardHeaderAction>
            <Button
              size="sm"
              variant="secondary"
              disabled={visibleRows.length === 0}
              onClick={handleDownload}
            >
              <IconDownload />
              Download CSV
            </Button>
          </CardHeaderAction>
        </CardHeader>
        <CardBody aria-busy={reportQuery.isFetching} className="p-0!">
          {reportQuery.isError ? (
            <div className="p-6">
              <Text className="text-sm text-danger">
                The payout report could not be loaded. Refresh and try again.
              </Text>
            </div>
          ) : reportQuery.isPending ? (
            <div className="p-6">
              <Text className="text-sm text-muted">Loading payout report…</Text>
            </div>
          ) : visibleRows.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={<IconInbox />}
                title="No payout records"
                description="No transfers or outstanding honorarium match the current filters."
                tone="secondary"
                className="rounded-lg"
              />
            </div>
          ) : (
            <div className="overflow-hidden rounded-b-xl">
              <TableContainer>
                <Table className="min-w-[1280px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tutor</TableHead>
                      <TableHead>Bank</TableHead>
                      <TableHead>Account number</TableHead>
                      <TableHead>Account holder</TableHead>
                      <TableHead className="text-right">
                        Gross honorarium
                      </TableHead>
                      <TableHead className="text-right">Deduction</TableHead>
                      <TableHead className="text-right">
                        Transfer amount
                      </TableHead>
                      <TableHead>Transfer status</TableHead>
                      <TableHead>Transfer date</TableHead>
                      <TableHead className="w-24 text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleRows.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <Text className="whitespace-nowrap font-medium">
                            {row.tutorName}
                          </Text>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {row.bankName || "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-sm">
                          {row.bankAccountNumber || "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {row.bankAccountHolderName || "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right tabular-nums">
                          {formatIdr(row.grossHonorariumIdr)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right tabular-nums">
                          {row.transferFeeIdr > 0
                            ? "−" + formatIdr(row.transferFeeIdr)
                            : formatIdr(0)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right font-semibold tabular-nums">
                          {formatIdr(row.netHonorariumIdr)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Badge variant={statusVariant(row)}>
                            {statusLabel(row)}
                          </Badge>
                          {row.status === "pending" &&
                          !row.payoutAccountComplete ? (
                            <Text className="mt-1 text-xs text-warning">
                              Account details incomplete
                            </Text>
                          ) : null}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {formatDate(row.paidAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setSelectedRow(row)}
                          >
                            Details
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </div>
          )}
        </CardBody>
      </Card>

      <Drawer
        open={selectedRow !== null}
        onOpenChange={(open) => {
          if (!open) closePayoutDetails();
        }}
      >
        <DrawerPopup direction="right" className="w-full max-w-2xl">
          <DrawerHeader className="justify-between border-b border-drawer-border pb-4.5">
            <div className="min-w-0">
              <DrawerTitle className="truncate">
                {selectedRow?.tutorName ?? "Tutor payout"}
              </DrawerTitle>
              <Text className="mt-1 text-sm text-muted">
                Review account details and transfer status.
              </Text>
            </div>
            <DrawerClose
              render={
                <Button
                  variant="plain"
                  size="sm"
                  aria-label="Close payout details"
                />
              }
            >
              <IconX />
            </DrawerClose>
          </DrawerHeader>
          <DrawerBody className="min-h-0 p-0!">
            {selectedRow ? (
              <div className="space-y-4 p-6">
                {selectedRow.status === "pending" &&
                selectedPendingQuery.isPending ? (
                  <Text className="text-sm text-muted">
                    Loading current payout details…
                  </Text>
                ) : selectedRow.status === "pending" &&
                  selectedPendingQuery.isError ? (
                  <Text className="text-sm text-danger">
                    Payout details could not be loaded. Refresh and try again.
                  </Text>
                ) : null}

                <section className="rounded-lg border border-item-border bg-item p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <IconCoins className="size-4 text-muted" />
                      <Text className="text-xs font-semibold uppercase tracking-wide text-dimmed">
                        Payment summary
                      </Text>
                    </div>
                    <Badge variant={statusVariant(selectedRow)}>
                      {statusLabel(selectedRow)}
                    </Badge>
                  </div>
                  <Text className="mt-2 text-sm text-muted">
                    {selectedRow.status === "paid"
                      ? "Transferred on " + formatDate(selectedRow.paidAt)
                      : selectedPendingQuery.data
                        ? selectedPendingQuery.data.completedSessions +
                          " completed session(s) since " +
                          (selectedPendingQuery.data.lastPaidAt
                            ? formatDate(selectedPendingQuery.data.lastPaidAt)
                            : "the first payout")
                        : "Current unpaid balance"}
                  </Text>
                  <div className="mt-4 grid gap-2 text-sm">
                    <div className="flex items-center justify-between gap-6">
                      <Text className="text-muted">Gross honorarium</Text>
                      <Text className="font-semibold">
                        {formatIdr(selectedCurrentGross)}
                      </Text>
                    </div>
                    <div className="flex items-center justify-between gap-6">
                      <Text className="text-muted">Transfer fee</Text>
                      <Text className="font-medium">
                        {selectedTransferFee > 0
                          ? "−" + formatIdr(selectedTransferFee)
                          : formatIdr(0)}
                      </Text>
                    </div>
                    <div className="flex items-center justify-between gap-6 border-t border-item-border pt-2">
                      <Text className="font-medium">Net to transfer</Text>
                      <Text className="font-semibold">
                        {formatIdr(
                          selectedRow.status === "paid"
                            ? selectedRow.netHonorariumIdr
                            : selectedNetHonorarium,
                        )}
                      </Text>
                    </div>
                  </div>
                </section>

                <section className="rounded-lg border border-item-border p-4">
                  <Text className="text-xs font-semibold uppercase tracking-wide text-dimmed">
                    Destination account
                  </Text>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <PayoutDetail
                      label="Bank"
                      value={selectedRow.bankName || "Not provided"}
                    />
                    <PayoutDetail
                      label="Account number"
                      value={selectedRow.bankAccountNumber || "Not provided"}
                      valueClassName="font-mono"
                    />
                    <PayoutDetail
                      label="Account holder"
                      value={
                        selectedRow.bankAccountHolderName || "Not provided"
                      }
                    />
                    <PayoutDetail
                      label="Opened in"
                      value={
                        selectedRow.bankAccountOpeningCity || "Not provided"
                      }
                    />
                    <PayoutDetail
                      label="Ownership"
                      value={
                        selectedRow.bankAccountOwnership === "self"
                          ? "Tutor's own account"
                          : selectedRow.bankAccountOwnership ===
                              "trusted_person"
                            ? "Trusted person's account"
                            : "Not provided"
                      }
                    />
                  </div>
                  <Text className="mt-4 text-sm text-muted">
                    Only conventional BCA (the exact bank name BCA) has no
                    transfer deduction. BCA Syariah, blu (BCA Digital), and
                    other banks deduct Rp2.500 once per payout.
                  </Text>
                  {selectedRow.status === "pending" &&
                  !selectedRow.payoutAccountComplete ? (
                    <Text className="mt-3 text-sm text-warning">
                      The tutor must complete and confirm all payout account
                      details before a transfer can be recorded.
                    </Text>
                  ) : null}
                </section>
              </div>
            ) : null}
          </DrawerBody>
          <DrawerFooter className="flex-wrap gap-2">
            <DrawerClose
              render={
                <Button
                  variant="secondary"
                  disabled={markPayoutMutation.isPending}
                  aria-label="Close payout details"
                />
              }
            >
              Close
            </DrawerClose>
            {selectedRow?.status === "pending" ? (
              <Button
                variant="primary"
                progress={markPayoutMutation.isPending}
                disabled={!canMarkSelectedPayout}
                onClick={() => setConfirmPaymentOpen(true)}
              >
                Mark as paid
              </Button>
            ) : null}
          </DrawerFooter>
        </DrawerPopup>
      </Drawer>

      <ConfirmationDialog
        open={confirmPaymentOpen}
        onOpenChange={setConfirmPaymentOpen}
        title="Confirm tutor payout"
        description={
          "This records the current unpaid honorarium for " +
          (selectedRow?.tutorName ?? "this tutor") +
          " as paid. Confirm that the net amount has already been transferred to the account shown."
        }
        confirmLabel="Mark as paid"
        pending={markPayoutMutation.isPending}
        onConfirm={markSelectedPayoutPaid}
      >
        <div className="rounded-lg border border-item-border bg-item p-3">
          <div className="flex items-center justify-between gap-4">
            <Text className="text-sm text-muted">Net to transfer</Text>
            <Text className="font-semibold">
              {formatIdr(selectedNetHonorarium)}
            </Text>
          </div>
          <Text className="mt-2 text-xs text-muted">
            This action advances the tutor&apos;s paid cutoff and cannot be
            undone from the payout workspace.
          </Text>
        </div>
      </ConfirmationDialog>
    </div>
  );
}
