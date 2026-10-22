"use client";

import { CrossBrowserDateTimeInput } from "@/components/booking/minute-time-input";

import { NumberField as SeliaNumberField } from "@cogito-app/ui/components/selia/number-field";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Card,
  CardBody,
  CardHeader,
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
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@cogito-app/ui/components/selia/field";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { Input } from "@cogito-app/ui/components/selia/input";
import { Checkbox } from "@cogito-app/ui/components/selia/checkbox";
import {
  Select,
  SelectItem,
  SelectList,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "@cogito-app/ui/components/selia/select";
import { Text, TextLink } from "@cogito-app/ui/components/selia/text";
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
import { EmptyState } from "@/components/empty-state";
import { getUserFacingError } from "@/lib/error-message";
import {
  formatPayoutCoverageLabel,
  formatTaxRateSnapshot,
} from "@/lib/tutor-payout-presentation";
import { client, orpc } from "@/utils/orpc";
import { buildTutorPayoutCsv } from "./tutor-payout-csv";

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const QUICK_RANGE_DAYS = [7, 30, 90] as const;
type PayoutReportRow = Awaited<
  ReturnType<typeof client.admin.getTutorPayoutReport>
>[number];
type PayoutSessionItem = Awaited<
  ReturnType<typeof client.admin.getPendingTutorPayouts>
>["items"][number];
type PayoutPreview = Awaited<
  ReturnType<typeof client.admin.previewTutorPayout>
>;
type StatusFilter = "pending" | "prepared" | "paid" | "void" | "all";
type SortOption = "priority" | "amount" | "name" | "latest";
const EMPTY_PAYOUT_ROWS: PayoutReportRow[] = [];

function formatIdr(value: number | null) {
  return value === null ? "—" : `Rp${value.toLocaleString("id-ID")}`;
}

function asDate(value: Date | string | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateTime(value: Date | string | null) {
  const date = asDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(date);
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
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function toWibStartIso(value: string) {
  return new Date(`${value}T00:00:00+07:00`).toISOString();
}

function toWibEndIso(value: string) {
  return new Date(`${value}T23:59:59.999+07:00`).toISOString();
}

function getDefaultRange() {
  const to = toWibDateKey(new Date());
  return { from: `${to.slice(0, 7)}-01`, to };
}

function getWibDateTimeInput() {
  return new Date(Date.now() + WIB_OFFSET_MS).toISOString().slice(0, 16);
}

function toWibTimestamp(value: string) {
  return new Date(`${value}:00+07:00`).toISOString();
}

function statusLabel(status: PayoutReportRow["status"]) {
  switch (status) {
    case "paid":
      return "Recorded transfer";
    case "prepared":
      return "Prepared";
    case "void":
      return "Void / reconcile";
    default:
      return "Unpaid sessions";
  }
}

function statusVariant(status: PayoutReportRow["status"]) {
  switch (status) {
    case "paid":
      return "success" as const;
    case "prepared":
      return "info" as const;
    case "void":
      return "danger" as const;
    default:
      return "warning" as const;
  }
}

function payoutDateSortValue(value: Date | string | null) {
  const date = asDate(value);
  return date ? date.getTime() : Number.NEGATIVE_INFINITY;
}

function payoutPriority(row: PayoutReportRow) {
  if (row.status === "pending") {
    if (!row.payoutAccountComplete || !row.taxProfileComplete) return 0;
    return 1;
  }
  if (row.status === "prepared") return 2;
  if (row.status === "void" && row.reconciliationStatus === "required") {
    return 3;
  }
  return 4;
}

function formatRate(rateBps: number | null) {
  return formatTaxRateSnapshot(rateBps);
}

function csvDownload(rows: PayoutReportRow[], from: string, to: string) {
  const csv = buildTutorPayoutCsv(rows, from, to);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `tutor-payouts-${from}-to-${to}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function PayoutDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <Text className="text-xs uppercase tracking-wide text-dimmed">
        {label}
      </Text>
      <Text className="mt-1 break-words font-medium">{value}</Text>
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
  const [sortOption, setSortOption] = useState<SortOption>("priority");
  const [selectedRow, setSelectedRow] = useState<PayoutReportRow | null>(null);
  const [selectedSourceKeys, setSelectedSourceKeys] = useState<string[]>([]);
  const [paidAt, setPaidAt] = useState(getWibDateTimeInput);
  const [actualAmount, setActualAmount] = useState("");
  const [reference, setReference] = useState("");
  const [proofUrl, setProofUrl] = useState("");
  const [voidReason, setVoidReason] = useState("");
  const [reconciliationReason, setReconciliationReason] = useState("");
  const [overrideRateBps, setOverrideRateBps] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [taxConfigReason, setTaxConfigReason] = useState("");
  const [taxRateDraftDirty, setTaxRateDraftDirty] = useState(false);
  const [taxRateDraft, setTaxRateDraft] = useState({
    nikNpwpRateBps: "250",
    nikOnlyRateBps: "300",
    missingRateBps: "300",
  });

  const reportQuery = useQuery(
    orpc.admin.getTutorPayoutReport.queryOptions({
      input: {
        dateFrom: toWibStartIso(appliedRange.from),
        dateTo: toWibEndIso(appliedRange.to),
      },
    }),
  );
  const taxConfigQuery = useQuery(orpc.admin.getTutorTaxConfig.queryOptions());
  const taxRateDraftValues =
    taxRateDraftDirty || !taxConfigQuery.data
      ? taxRateDraft
      : {
          nikNpwpRateBps: String(taxConfigQuery.data.nikNpwpRateBps),
          nikOnlyRateBps: String(taxConfigQuery.data.nikOnlyRateBps),
          missingRateBps: String(taxConfigQuery.data.missingRateBps),
        };
  const reportRows = reportQuery.data ?? EMPTY_PAYOUT_ROWS;
  const visibleRows = useMemo(() => {
    const filtered = reportRows.filter(
      (row) => statusFilter === "all" || row.status === statusFilter,
    );
    return filtered.toSorted((a, b) => {
      if (sortOption === "priority") {
        const difference = payoutPriority(a) - payoutPriority(b);
        if (difference !== 0) return difference;
        return (b.netHonorariumIdr ?? -1) - (a.netHonorariumIdr ?? -1);
      }
      if (sortOption === "amount") {
        return (b.netHonorariumIdr ?? -1) - (a.netHonorariumIdr ?? -1);
      }
      if (sortOption === "name")
        return a.tutorName.localeCompare(b.tutorName, "id");
      return (
        payoutDateSortValue(b.paidAt ?? b.voidedAt) -
        payoutDateSortValue(a.paidAt ?? a.voidedAt)
      );
    });
  }, [reportRows, sortOption, statusFilter]);

  const pendingQuery = useQuery({
    ...orpc.admin.getPendingTutorPayouts.queryOptions({
      input: { tutorId: selectedRow?.tutorId ?? "" },
    }),
    enabled: selectedRow?.status === "pending" && Boolean(selectedRow.tutorId),
  });
  const allocationQuery = useQuery({
    ...orpc.admin.getTutorPayoutAllocations.queryOptions({
      input: { payoutId: selectedRow?.id ?? "" },
    }),
    enabled: Boolean(selectedRow && selectedRow.status !== "pending"),
  });
  const previewQuery = useQuery({
    ...orpc.admin.previewTutorPayout.queryOptions({
      input: {
        tutorId: selectedRow?.tutorId ?? "",
        sourceKeys: selectedSourceKeys,
      },
    }),
    enabled: selectedRow?.status === "pending" && selectedSourceKeys.length > 0,
  });
  const selectedItems: PayoutSessionItem[] =
    selectedRow?.status === "pending"
      ? (pendingQuery.data?.items ?? [])
      : ((allocationQuery.data?.items ?? []) as PayoutSessionItem[]);

  function invalidatePayouts() {
    void queryClient.invalidateQueries({
      queryKey: orpc.admin.getTutorPayoutReport.key(),
    });
    void queryClient.invalidateQueries({
      queryKey: orpc.admin.getPendingTutorPayouts.key(),
    });
    void queryClient.invalidateQueries({
      queryKey: orpc.admin.getTutorPayoutAllocations.key(),
    });
  }

  const previewMutation = useMutation(
    orpc.admin.prepareTutorPayout.mutationOptions({
      onSuccess: () => {
        setSelectedRow(null);
        setSelectedSourceKeys([]);
        invalidatePayouts();
        toastManager.add({
          title: "Payout prepared",
          description:
            "Perform the transfer through your bank, then record its exact amount and date.",
          type: "success",
        });
      },
      onError: (error: unknown) =>
        toastManager.add({
          title: "Payout could not be prepared",
          description: getUserFacingError(error),
          type: "error",
        }),
    }),
  );
  const recordMutation = useMutation(
    orpc.admin.recordTutorPayoutTransfer.mutationOptions({
      onSuccess: () => {
        setSelectedRow(null);
        setActualAmount("");
        setReference("");
        setProofUrl("");
        invalidatePayouts();
        toastManager.add({
          title: "External transfer recorded",
          description:
            "The tutor has been notified and the payout history is saved.",
          type: "success",
        });
      },
      onError: (error: unknown) =>
        toastManager.add({
          title: "Transfer could not be recorded",
          description: getUserFacingError(error),
          type: "error",
        }),
    }),
  );
  const voidMutation = useMutation(
    orpc.admin.voidTutorPayout.mutationOptions({
      onSuccess: () => {
        setSelectedRow(null);
        setVoidReason("");
        invalidatePayouts();
        toastManager.add({
          title: "Payout voided",
          description:
            "The history and transfer evidence remain. Any external transfer must be reconciled before repayment.",
          type: "success",
        });
      },
      onError: (error: unknown) =>
        toastManager.add({
          title: "Payout could not be voided",
          description: getUserFacingError(error),
          type: "error",
        }),
    }),
  );
  const reconciliationMutation = useMutation(
    orpc.admin.resolveTutorPayoutReconciliation.mutationOptions({
      onSuccess: () => {
        setSelectedRow(null);
        setReconciliationReason("");
        invalidatePayouts();
        toastManager.add({
          title: "Reconciliation recorded",
          description: "The audit history now records the resolution.",
          type: "success",
        });
      },
      onError: (error: unknown) =>
        toastManager.add({
          title: "Reconciliation could not be saved",
          description: getUserFacingError(error),
          type: "error",
        }),
    }),
  );
  const taxConfigMutation = useMutation(
    orpc.admin.updateTutorTaxConfig.mutationOptions({
      onSuccess: (result) => {
        queryClient.setQueryData(orpc.admin.getTutorTaxConfig.key(), result);
        void queryClient.invalidateQueries({
          queryKey: orpc.admin.getTutorTaxConfig.key(),
        });
        setTaxRateDraft({
          nikNpwpRateBps: String(result.nikNpwpRateBps),
          nikOnlyRateBps: String(result.nikOnlyRateBps),
          missingRateBps: String(result.missingRateBps),
        });
        setTaxRateDraftDirty(false);
        setTaxConfigReason("");
        toastManager.add({
          title: "Default payout rates updated",
          description: "The change is audited and affects future previews.",
          type: "success",
        });
      },
      onError: (error: unknown) =>
        toastManager.add({
          title: "Default rates could not be saved",
          description: getUserFacingError(error),
          type: "error",
        }),
    }),
  );
  const overrideMutation = useMutation(
    orpc.admin.setTutorTaxRateOverride.mutationOptions({
      onSuccess: () => {
        setSelectedRow(null);
        setOverrideReason("");
        setOverrideRateBps("");
        invalidatePayouts();
        toastManager.add({
          title: "Tutor rate override saved",
          description:
            "The override is audited and future previews will use it.",
          type: "success",
        });
      },
      onError: (error: unknown) =>
        toastManager.add({
          title: "Tutor rate override could not be saved",
          description: getUserFacingError(error),
          type: "error",
        }),
    }),
  );

  const isSaving =
    previewMutation.isPending ||
    recordMutation.isPending ||
    voidMutation.isPending ||
    reconciliationMutation.isPending ||
    overrideMutation.isPending ||
    taxConfigMutation.isPending;
  const dateRangeError =
    !draftFrom || !draftTo
      ? "Select both a start and end date."
      : draftFrom > draftTo
        ? "The start date cannot be after the end date."
        : null;

  function openRow(row: PayoutReportRow) {
    setSelectedRow(row);
    setSelectedSourceKeys([]);
    setPaidAt(getWibDateTimeInput());
    setActualAmount(
      row.status === "prepared" ? String(row.netHonorariumIdr ?? "") : "",
    );
    setReference(row.actualReference ?? "");
    setProofUrl("");
    setVoidReason("");
    setReconciliationReason("");
    setOverrideRateBps("");
  }

  function closeDetails() {
    if (isSaving) return;
    setSelectedRow(null);
  }

  function handleDownload() {
    csvDownload(reportRows, appliedRange.from, appliedRange.to);
    toastManager.add({
      title: "Monthly payout CSV downloaded",
      description:
        "Paid transfers use their actual Asia/Jakarta transfer date. Void and reconciliation rows are kept in a separate section.",
      type: "success",
    });
  }

  function prepareSelectedPayout(preview: PayoutPreview) {
    if (!selectedRow || selectedRow.status !== "pending") return;
    previewMutation.mutate({
      tutorId: selectedRow.tutorId,
      sourceKeys: preview.sourceKeys,
      previewVersion: preview.previewVersion,
      operationId: crypto.randomUUID(),
    });
  }

  function recordPreparedTransfer() {
    if (
      !selectedRow ||
      selectedRow.status !== "prepared" ||
      !selectedRow.previewVersion ||
      !paidAt ||
      !actualAmount
    ) {
      return;
    }
    const enteredAmount = Number(actualAmount);
    if (
      !/^\d+$/.test(actualAmount) ||
      !Number.isSafeInteger(enteredAmount) ||
      enteredAmount !== selectedRow.netHonorariumIdr
    ) {
      toastManager.add({
        title: "Transfer amount does not match",
        description: `Enter the exact saved net amount of ${formatIdr(selectedRow.netHonorariumIdr)}.`,
        type: "error",
      });
      return;
    }
    recordMutation.mutate({
      payoutId: selectedRow.id,
      previewVersion: selectedRow.previewVersion,
      actualAmountIdr: enteredAmount,
      paidAt: toWibTimestamp(paidAt),
      reference: reference.trim() || undefined,
      proofUrl: proofUrl.trim() || undefined,
    });
  }

  const selectedPreview = previewQuery.data;
  const canPrepare = Boolean(
    selectedPreview &&
    selectedSourceKeys.length > 0 &&
    selectedRow?.payoutAccountComplete &&
    selectedPreview.legalName &&
    selectedPreview.nik &&
    selectedPreview.netHonorariumIdr >= 0,
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Heading level={1} size="md">
            Tutor payouts
          </Heading>
          <Text className="mt-1 max-w-3xl text-muted">
            Select unpaid sessions, prepare a fixed preview, perform the bank
            transfer separately, then record its actual amount and evidence.
          </Text>
        </div>
        <Button
          size="sm"
          variant="secondary"
          progress={reportQuery.isFetching}
          onClick={() => void reportQuery.refetch()}
        >
          <IconRefresh />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Default tax rates</CardTitle>
            <Text className="mt-1 text-sm text-muted">
              Basis points are hundredths of a percent. These configurable
              product defaults are not legal validation or tax advice.
            </Text>
          </div>
        </CardHeader>
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            {(
              [
                ["nikNpwpRateBps", "NIK + NPWP"],
                ["nikOnlyRateBps", "NIK only"],
                ["missingRateBps", "Missing identity"],
              ] as const
            ).map(([key, label]) => (
              <Field key={key}>
                <FieldLabel htmlFor={`tax-rate-${key}`}>
                  {label} (bps)
                </FieldLabel>
                <SeliaNumberField
                  id={`tax-rate-${key}`}
                  allowOutOfRange
                  format={{ useGrouping: false }}
                  min={0}
                  max={10000}
                  step={1}
                  value={
                    taxRateDraftValues[key] === ""
                      ? null
                      : Number(taxRateDraftValues[key])
                  }
                  onValueChange={(nextValue) => {
                    const value = nextValue === null ? "" : String(nextValue);
                    setTaxRateDraft((current) => ({
                      ...(taxRateDraftDirty ? current : taxRateDraftValues),
                      [key]: value,
                    }));
                    setTaxRateDraftDirty(true);
                  }}
                />
                <FieldDescription>
                  {taxRateDraftValues[key] === ""
                    ? "Enter a whole number from 0 to 10000."
                    : `${(Number(taxRateDraftValues[key]) / 100).toFixed(2)}%`}
                </FieldDescription>
              </Field>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <Field className="min-w-64 flex-1">
              <FieldLabel htmlFor="tax-config-reason">Change reason</FieldLabel>
              <Input
                id="tax-config-reason"
                maxLength={2000}
                value={taxConfigReason}
                onChange={(event) => setTaxConfigReason(event.target.value)}
                placeholder="Why are these defaults changing?"
              />
            </Field>
            <Button
              disabled={
                taxConfigMutation.isPending ||
                !taxConfigReason.trim() ||
                !taxConfigQuery.data ||
                Object.values(taxRateDraftValues).some(
                  (value) => !/^\d+$/.test(value) || Number(value) > 10000,
                )
              }
              progress={taxConfigMutation.isPending}
              onClick={() => {
                const config = taxConfigQuery.data;
                if (!config) return;
                taxConfigMutation.mutate({
                  expectedVersion: config.version,
                  nikNpwpRateBps: Number(taxRateDraftValues.nikNpwpRateBps),
                  nikOnlyRateBps: Number(taxRateDraftValues.nikOnlyRateBps),
                  missingRateBps: Number(taxRateDraftValues.missingRateBps),
                  reason: taxConfigReason.trim(),
                });
              }}
            >
              Save default rates
            </Button>
          </div>
          {taxConfigQuery.isError ? (
            <FieldError>Tax defaults could not be loaded.</FieldError>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Payout filters</CardTitle>
            <Text className="mt-1 text-sm text-muted">
              Paid and void history follows the selected dates in Asia/Jakarta.
              Current unpaid sessions remain visible.
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
              <FieldLabel>Status</FieldLabel>
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
                    <SelectItem value="pending">Unpaid sessions</SelectItem>
                    <SelectItem value="prepared">Prepared</SelectItem>
                    <SelectItem value="paid">Recorded transfer</SelectItem>
                    <SelectItem value="void">Void / reconcile</SelectItem>
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
                    <SelectItem value="priority">Action priority</SelectItem>
                    <SelectItem value="amount">Highest net amount</SelectItem>
                    <SelectItem value="name">Tutor name</SelectItem>
                    <SelectItem value="latest">Latest transfer</SelectItem>
                  </SelectList>
                </SelectPopup>
              </Select>
            </Field>
          </div>
          <div className="flex flex-wrap items-end justify-between gap-4 border-t border-card-separator pt-5">
            <div className="flex flex-wrap gap-2">
              {QUICK_RANGE_DAYS.map((days) => (
                <Button
                  key={days}
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    const to = toWibDateKey(new Date());
                    const from = shiftDateKey(to, -(days - 1));
                    setDraftFrom(from);
                    setDraftTo(to);
                    setAppliedRange({ from, to });
                  }}
                >
                  {days} days
                </Button>
              ))}
              <Button
                disabled={Boolean(dateRangeError)}
                onClick={() =>
                  setAppliedRange({ from: draftFrom, to: draftTo })
                }
              >
                Apply date range
              </Button>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleDownload}
              disabled={reportQuery.isPending || reportQuery.isError}
            >
              <IconDownload />
              Download monthly CSV
            </Button>
          </div>
          {dateRangeError ? (
            <Text className="text-sm text-danger">{dateRangeError}</Text>
          ) : null}
        </CardBody>
      </Card>

      <Card id="admin-tutor-payouts" className="scroll-mt-4">
        <CardHeader>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>Tutor payout records</CardTitle>
              <Badge variant="secondary">{visibleRows.length} rows</Badge>
            </div>
            <Text className="mt-1 text-sm text-muted">
              {appliedRange.from} to {appliedRange.to} · paid export uses actual
              transfer date
            </Text>
          </div>
        </CardHeader>
        <CardBody aria-busy={reportQuery.isFetching}>
          {reportQuery.isError ? (
            <div>
              <Text className="text-sm text-danger">
                The payout report could not be loaded. Refresh and try again.
              </Text>
            </div>
          ) : reportQuery.isPending ? (
            <div>
              <Text className="text-sm text-muted">
                Loading payout records…
              </Text>
            </div>
          ) : visibleRows.length === 0 ? (
            <div>
              <EmptyState
                icon={<IconInbox />}
                title="No payout records"
                description="No records match this status and date range."
                tone="secondary"
                className="rounded-lg"
              />
            </div>
          ) : (
            <TableContainer>
              <Table className="min-w-[1500px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Tutor</TableHead>
                    <TableHead>Bank</TableHead>
                    <TableHead>Account number</TableHead>
                    <TableHead>Sessions</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead>Tax rate</TableHead>
                    <TableHead className="text-right">Tax</TableHead>
                    <TableHead className="text-right">Transfer fee</TableHead>
                    <TableHead className="text-right">Net</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Paid at</TableHead>
                    <TableHead className="text-right">Action</TableHead>
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
                      <TableCell>{row.bankName || "—"}</TableCell>
                      <TableCell className="font-mono">
                        {row.bankAccountNumber || "—"}
                      </TableCell>
                      <TableCell>
                        {formatPayoutCoverageLabel(
                          row.coveredSessionCount,
                          row.status === "pending" ||
                            row.status === "prepared" ||
                            row.coveredSessionCount > 0,
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatIdr(row.grossHonorariumIdr)}
                      </TableCell>
                      <TableCell>
                        {formatRate(row.taxRateBps)}
                        {row.taxRateSource ? (
                          <Text className="text-xs text-dimmed">
                            {row.taxRateSource}
                          </Text>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatIdr(row.taxHonorariumIdr)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatIdr(row.transferFeeIdr)}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatIdr(row.netHonorariumIdr)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(row.status)}>
                          {statusLabel(row.status)}
                        </Badge>
                        {row.status === "void" &&
                        row.reconciliationStatus === "required" ? (
                          <Text className="mt-1 text-xs text-warning">
                            External transfer must be reconciled
                          </Text>
                        ) : null}
                      </TableCell>
                      <TableCell>{formatDateTime(row.paidAt)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => openRow(row)}
                        >
                          Details
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardBody>
      </Card>

      <Drawer
        open={selectedRow !== null}
        onOpenChange={(open) => {
          if (!open) closeDetails();
        }}
      >
        <DrawerPopup direction="right" className="w-full max-w-3xl">
          <DrawerHeader className="justify-between border-b border-drawer-border pb-4.5">
            <div className="min-w-0">
              <DrawerTitle className="truncate">
                {selectedRow?.tutorName ?? "Tutor payout"}
              </DrawerTitle>
              <Text className="mt-1 text-sm text-muted">
                {selectedRow ? statusLabel(selectedRow.status) : ""} · all
                transfer actions are recorded after the external bank transfer
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
          <DrawerBody className="min-h-0 space-y-4 p-5">
            {selectedRow ? (
              <>
                <section className="rounded-lg border border-item-border bg-item p-4">
                  <div className="flex items-center gap-2">
                    <IconCoins className="size-4 text-muted" />
                    <Text className="text-xs font-semibold uppercase tracking-wide text-dimmed">
                      Saved payout snapshot
                    </Text>
                    <Badge variant={statusVariant(selectedRow.status)}>
                      {statusLabel(selectedRow.status)}
                    </Badge>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
                    <PayoutDetail
                      label="Bank"
                      value={selectedRow.bankName || "—"}
                    />
                    <PayoutDetail
                      label="Account number"
                      value={selectedRow.bankAccountNumber || "—"}
                    />
                    <PayoutDetail
                      label="Account holder"
                      value={selectedRow.bankAccountHolderName || "—"}
                    />
                    <PayoutDetail
                      label="Account opening city"
                      value={selectedRow.bankAccountOpeningCity || "—"}
                    />
                    <PayoutDetail
                      label="Account ownership"
                      value={selectedRow.bankAccountOwnership || "—"}
                    />
                    <PayoutDetail
                      label="Gross"
                      value={formatIdr(selectedRow.grossHonorariumIdr)}
                    />
                    <PayoutDetail
                      label="Tax legal name"
                      value={selectedRow.taxLegalName || "—"}
                    />
                    <PayoutDetail
                      label="Tax status"
                      value={selectedRow.taxStatus ?? "Legacy record"}
                    />
                    <PayoutDetail
                      label="Tax rate"
                      value={formatRate(selectedRow.taxRateBps)}
                    />
                    <PayoutDetail
                      label="NIK ending"
                      value={selectedRow.taxNik?.slice(-4) || "—"}
                    />
                    <PayoutDetail
                      label="NPWP ending"
                      value={selectedRow.taxNpwp?.slice(-4) || "—"}
                    />
                    <PayoutDetail
                      label="Tax withheld"
                      value={
                        selectedRow.taxHonorariumIdr === null
                          ? "Tax snapshot unavailable"
                          : formatIdr(selectedRow.taxHonorariumIdr)
                      }
                    />
                    <PayoutDetail
                      label="Transfer fee"
                      value={formatIdr(selectedRow.transferFeeIdr)}
                    />
                    <PayoutDetail
                      label="Calculated net"
                      value={formatIdr(selectedRow.netHonorariumIdr)}
                    />
                    <PayoutDetail
                      label="Actual transfer"
                      value={formatIdr(selectedRow.actualAmountIdr)}
                    />
                    <PayoutDetail
                      label="Actual paid at"
                      value={formatDateTime(selectedRow.paidAt)}
                    />
                    <PayoutDetail
                      label="Transfer recorded at"
                      value={formatDateTime(selectedRow.transferRecordedAt)}
                    />
                    <PayoutDetail
                      label="Recorded by"
                      value={selectedRow.transferRecordedBy ?? "—"}
                    />
                    <PayoutDetail
                      label="Reference"
                      value={selectedRow.actualReference || "—"}
                    />
                  </div>
                  {selectedRow.actualProofUrl ? (
                    <Text className="mt-3 text-sm">
                      <TextLink
                        href={selectedRow.actualProofUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        View transfer proof
                      </TextLink>
                    </Text>
                  ) : null}
                  {selectedRow.status === "void" ? (
                    <Text className="mt-3 text-sm text-muted">
                      Void reason: {selectedRow.voidReason || "—"}.
                      Reconciliation: {selectedRow.reconciliationStatus}
                      {selectedRow.reconciliationReason
                        ? ` · ${selectedRow.reconciliationReason}`
                        : ""}
                    </Text>
                  ) : null}
                  {selectedRow.status === "prepared" ? (
                    <Text className="mt-3 text-sm text-warning">
                      Use this saved destination and net amount to perform the
                      transfer externally. Recording below does not send money.
                    </Text>
                  ) : null}
                </section>

                {selectedRow.status === "pending" ? (
                  <section className="space-y-4 rounded-lg border border-item-border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <Text className="font-semibold">
                          Select unpaid sessions
                        </Text>
                        <Text className="mt-1 text-sm text-muted">
                          A prepared payout reserves these exact source rows.
                        </Text>
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={!pendingQuery.data?.items.length}
                        onClick={() =>
                          setSelectedSourceKeys(
                            pendingQuery.data?.items.map(
                              (item) => item.sourceKey,
                            ) ?? [],
                          )
                        }
                      >
                        Select all
                      </Button>
                    </div>
                    {pendingQuery.isPending ? (
                      <Text className="text-sm text-muted">
                        Loading unpaid sessions…
                      </Text>
                    ) : pendingQuery.isError ? (
                      <FieldError>
                        Unpaid sessions could not be loaded.
                      </FieldError>
                    ) : selectedItems.length === 0 ? (
                      <Text className="text-sm text-muted">
                        No unpaid sessions remain.
                      </Text>
                    ) : (
                      <div className="divide-y divide-item-border">
                        {selectedItems.map((item) => {
                          const checked = selectedSourceKeys.includes(
                            item.sourceKey,
                          );
                          return (
                            <label
                              key={item.sourceKey}
                              className="flex cursor-pointer items-start gap-3 py-3"
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(value) =>
                                  setSelectedSourceKeys((current) =>
                                    value === true
                                      ? [...current, item.sourceKey]
                                      : current.filter(
                                          (key) => key !== item.sourceKey,
                                        ),
                                  )
                                }
                                aria-label={`Select session ${item.deliveryLabel ?? (item.bookingNumber === null ? `Class session ${item.classSessionId ?? ""}` : `Booking #${item.bookingNumber}`)}`}
                              />
                              <span className="min-w-0 flex-1">
                                <Text className="font-medium">
                                  {item.deliveryLabel ??
                                    (item.bookingNumber === null
                                      ? `Class session ${item.classSessionId ?? ""}`
                                      : `${item.bookingType} · #${item.bookingNumber}`)}
                                  {item.bookingSessionId
                                    ? " · series session"
                                    : ""}
                                </Text>
                                <Text className="text-sm text-muted">
                                  {formatDateTime(item.scheduledStartAt)} ·{" "}
                                  {item.deliveryStatus}
                                </Text>
                                <Text className="text-xs text-dimmed">
                                  {item.sourceType} · earned{" "}
                                  {formatDateTime(item.earnedAt)}
                                </Text>
                              </span>
                              <Text className="shrink-0 font-semibold">
                                {formatIdr(item.grossHonorariumIdr)}
                              </Text>
                            </label>
                          );
                        })}
                      </div>
                    )}

                    {selectedSourceKeys.length > 0 && previewQuery.isPending ? (
                      <Text className="text-sm text-muted">
                        Building current preview…
                      </Text>
                    ) : null}
                    {previewQuery.isError ? (
                      <FieldError>
                        {getUserFacingError(previewQuery.error)}
                      </FieldError>
                    ) : null}
                    {selectedPreview ? (
                      <div className="rounded-lg bg-accent p-4">
                        <Text className="font-semibold">
                          Versioned payout preview
                        </Text>
                        <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                          <PayoutDetail
                            label="Gross"
                            value={formatIdr(
                              selectedPreview.grossHonorariumIdr,
                            )}
                          />
                          <PayoutDetail
                            label="Tax status / rate"
                            value={`${selectedPreview.taxStatus} · ${formatRate(selectedPreview.taxRateBps)}`}
                          />
                          <PayoutDetail
                            label="Withholding"
                            value={formatIdr(selectedPreview.taxHonorariumIdr)}
                          />
                          <PayoutDetail
                            label="Transfer fee"
                            value={formatIdr(selectedPreview.transferFeeIdr)}
                          />
                          <PayoutDetail
                            label="Net to transfer"
                            value={formatIdr(selectedPreview.netHonorariumIdr)}
                          />
                          <PayoutDetail
                            label="Sessions"
                            value={String(selectedPreview.items.length)}
                          />
                          <PayoutDetail
                            label="Bank"
                            value={selectedPreview.bankName || "—"}
                          />
                          <PayoutDetail
                            label="Account number"
                            value={selectedPreview.bankAccountNumber || "—"}
                          />
                          <PayoutDetail
                            label="Account holder"
                            value={selectedPreview.bankAccountHolderName || "—"}
                          />
                        </div>
                        <Text className="mt-3 text-sm text-muted">
                          Identity: {selectedPreview.legalName || "Incomplete"}{" "}
                          · NIK ending {selectedPreview.nik?.slice(-4) || "—"} ·
                          NPWP ending {selectedPreview.npwp?.slice(-4) || "—"}
                        </Text>
                        {!selectedRow.payoutAccountComplete ? (
                          <FieldError className="mt-2 block">
                            Bank details must be complete before preparing this
                            batch.
                          </FieldError>
                        ) : null}
                        {!selectedPreview.legalName || !selectedPreview.nik ? (
                          <FieldError className="mt-2 block">
                            Legal name and a valid 16-digit NIK are required
                            before preparing a new payout.
                          </FieldError>
                        ) : null}
                        <Button
                          className="mt-4"
                          disabled={!canPrepare || previewMutation.isPending}
                          progress={previewMutation.isPending}
                          onClick={() => prepareSelectedPayout(selectedPreview)}
                        >
                          Prepare selected batch
                        </Button>
                      </div>
                    ) : null}
                  </section>
                ) : null}

                {selectedRow.status !== "pending" ? (
                  <section className="space-y-3 rounded-lg border border-item-border p-4">
                    <Text className="font-semibold">
                      {formatPayoutCoverageLabel(
                        selectedItems.length,
                        selectedRow.status === "prepared" ||
                          selectedRow.coveredSessionCount > 0,
                      )}
                    </Text>
                    {allocationQuery.isPending ? (
                      <Text className="text-sm text-muted">
                        Loading saved session rows…
                      </Text>
                    ) : selectedItems.length === 0 ? (
                      <Text className="text-sm text-muted">
                        No session-level allocation was stored for this
                        historical row.
                      </Text>
                    ) : (
                      <div className="divide-y divide-item-border">
                        {selectedItems.map((item) => (
                          <div
                            key={item.sourceKey}
                            className="flex items-start justify-between gap-4 py-3"
                          >
                            <div>
                              <Text className="font-medium">
                                {item.deliveryLabel ??
                                  (item.bookingNumber === null
                                    ? `Class session ${item.classSessionId ?? ""}`
                                    : `${item.bookingType} · #${item.bookingNumber}`)}
                                {item.bookingSessionId
                                  ? " · series session"
                                  : ""}
                              </Text>
                              <Text className="text-sm text-muted">
                                {formatDateTime(item.scheduledStartAt)} ·{" "}
                                {item.deliveryStatus}
                              </Text>
                              <Text className="text-xs text-dimmed">
                                {item.sourceType} · earned{" "}
                                {formatDateTime(item.earnedAt)}
                              </Text>
                            </div>
                            <Text className="font-semibold">
                              {formatIdr(item.grossHonorariumIdr)}
                            </Text>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                ) : null}

                {selectedRow.status === "prepared" ? (
                  <section className="space-y-4 rounded-lg border border-item-border p-4">
                    <Text className="font-semibold">
                      Record external transfer
                    </Text>
                    <Text className="text-sm text-muted">
                      Record this only after the bank transfer has actually been
                      performed. The amount must exactly match the saved net.
                    </Text>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field>
                        <FieldLabel htmlFor="payout-actual-amount">
                          Actual amount (IDR)
                        </FieldLabel>
                        <SeliaNumberField
                          id="payout-actual-amount"
                          allowOutOfRange
                          format={{ useGrouping: false }}
                          min={0}
                          step={1}
                          value={
                            actualAmount === "" ? null : Number(actualAmount)
                          }
                          onValueChange={(nextValue) =>
                            setActualAmount(
                              nextValue === null ? "" : String(nextValue),
                            )
                          }
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="payout-actual-paid-at">
                          Actual paid date and time (Asia/Jakarta)
                        </FieldLabel>
                        <CrossBrowserDateTimeInput
                          id="payout-actual-paid-at"
                          value={paidAt}
                          onChange={(value) => setPaidAt(value)}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="payout-reference">
                          Transfer reference (optional)
                        </FieldLabel>
                        <Input
                          id="payout-reference"
                          maxLength={255}
                          value={reference}
                          onChange={(event) => setReference(event.target.value)}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="payout-proof-url">
                          Proof URL (optional)
                        </FieldLabel>
                        <Input
                          id="payout-proof-url"
                          type="url"
                          maxLength={2000}
                          value={proofUrl}
                          onChange={(event) => setProofUrl(event.target.value)}
                        />
                      </Field>
                    </div>
                    <Button
                      disabled={
                        !actualAmount || !paidAt || recordMutation.isPending
                      }
                      progress={recordMutation.isPending}
                      onClick={recordPreparedTransfer}
                    >
                      Record transfer as paid
                    </Button>
                  </section>
                ) : null}

                {selectedRow.status === "void" &&
                selectedRow.reconciliationStatus === "required" ? (
                  <section className="space-y-3 rounded-lg border border-warning-border bg-warning-subtle p-4">
                    <Text className="font-semibold">
                      External transfer reconciliation required
                    </Text>
                    <Text className="text-sm text-muted">
                      These sessions remain blocked from repayment until an
                      admin records how the external transfer was reconciled.
                    </Text>
                    <Field>
                      <FieldLabel htmlFor="payout-reconciliation-reason">
                        Resolution details
                      </FieldLabel>
                      <Input
                        id="payout-reconciliation-reason"
                        maxLength={2000}
                        value={reconciliationReason}
                        onChange={(event) =>
                          setReconciliationReason(event.target.value)
                        }
                      />
                    </Field>
                    <Button
                      disabled={
                        !reconciliationReason.trim() ||
                        reconciliationMutation.isPending
                      }
                      progress={reconciliationMutation.isPending}
                      onClick={() =>
                        reconciliationMutation.mutate({
                          payoutId: selectedRow.id,
                          reason: reconciliationReason.trim(),
                        })
                      }
                    >
                      Resolve reconciliation
                    </Button>
                  </section>
                ) : null}

                {selectedRow.status === "prepared" ||
                selectedRow.status === "paid" ? (
                  <section className="space-y-3 rounded-lg border border-item-border p-4">
                    <Text className="font-semibold">Void this payout</Text>
                    <Text className="text-sm text-muted">
                      The record and transfer evidence stay in history. If a
                      transfer was performed, repayment stays blocked until
                      reconciliation is resolved.
                    </Text>
                    <Field>
                      <FieldLabel htmlFor="payout-void-reason">
                        Void reason
                      </FieldLabel>
                      <Input
                        id="payout-void-reason"
                        maxLength={2000}
                        value={voidReason}
                        onChange={(event) => setVoidReason(event.target.value)}
                      />
                    </Field>
                    <Button
                      variant="secondary"
                      disabled={!voidReason.trim() || voidMutation.isPending}
                      progress={voidMutation.isPending}
                      onClick={() =>
                        voidMutation.mutate({
                          payoutId: selectedRow.id,
                          reason: voidReason.trim(),
                        })
                      }
                    >
                      Void with audit record
                    </Button>
                  </section>
                ) : null}

                {selectedRow.status !== "void" ? (
                  <section className="space-y-3 rounded-lg border border-item-border p-4">
                    <Text className="font-semibold">Tutor rate override</Text>
                    <Text className="text-sm text-muted">
                      Leave blank to clear the override and use the current
                      configured default. This affects future previews only.
                    </Text>
                    <div className="flex flex-wrap items-end gap-3">
                      <Field className="min-w-48 flex-1">
                        <FieldLabel htmlFor="tutor-rate-override">
                          Override (basis points)
                        </FieldLabel>
                        <SeliaNumberField
                          id="tutor-rate-override"
                          allowOutOfRange
                          format={{
                            useGrouping: false,
                            maximumFractionDigits: 2,
                          }}
                          min={0}
                          max={10000}
                          step={1}
                          value={
                            overrideRateBps === ""
                              ? null
                              : Number(overrideRateBps)
                          }
                          onValueChange={(nextValue) =>
                            setOverrideRateBps(
                              nextValue === null ? "" : String(nextValue),
                            )
                          }
                        />
                      </Field>
                      <Field className="min-w-64 flex-1">
                        <FieldLabel htmlFor="tutor-rate-override-reason">
                          Reason
                        </FieldLabel>
                        <Input
                          id="tutor-rate-override-reason"
                          maxLength={2000}
                          value={overrideReason}
                          onChange={(event) =>
                            setOverrideReason(event.target.value)
                          }
                        />
                      </Field>
                      <Button
                        variant="secondary"
                        disabled={
                          overrideMutation.isPending ||
                          !overrideReason.trim() ||
                          (overrideRateBps !== "" &&
                            (!/^\d+$/.test(overrideRateBps) ||
                              Number(overrideRateBps) > 10000))
                        }
                        progress={overrideMutation.isPending}
                        onClick={() =>
                          overrideMutation.mutate({
                            tutorId: selectedRow.tutorId,
                            rateBps:
                              overrideRateBps === ""
                                ? null
                                : Number(overrideRateBps),
                            reason: overrideReason.trim(),
                          })
                        }
                      >
                        Save override
                      </Button>
                    </div>
                  </section>
                ) : null}
              </>
            ) : null}
          </DrawerBody>
          <DrawerFooter>
            <DrawerClose
              render={
                <Button
                  variant="secondary"
                  aria-label="Close payout details"
                  disabled={isSaving}
                />
              }
            >
              Close
            </DrawerClose>
          </DrawerFooter>
        </DrawerPopup>
      </Drawer>
    </div>
  );
}
