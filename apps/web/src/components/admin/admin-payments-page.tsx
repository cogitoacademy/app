"use client";

import { useState, type FormEvent } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  IconAlertTriangle,
  IconInbox,
  IconRefresh,
  IconSearch,
} from "@tabler/icons-react";

import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Button } from "@cogito-app/ui/components/selia/button";
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
import { Text } from "@cogito-app/ui/components/selia/text";
import { Textarea } from "@cogito-app/ui/components/selia/textarea";
import { toastManager } from "@cogito-app/ui/components/selia/toast";

import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { EmptyState } from "@/components/empty-state";
import Loader from "@/components/loader";
import { TablePagination } from "@/components/table-pagination";
import { getUserFacingError } from "@/lib/error-message";
import { client, orpc } from "@/utils/orpc";

const PAGE_SIZE = 50;

const PAYMENT_STATUSES = [
  "PENDING",
  "PAID",
  "SETTLED",
  "FAILED",
  "EXPIRED",
  "REFUNDED",
] as const;

type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
type StatusFilter = "ALL" | PaymentStatus;
type PaymentRow = Awaited<
  ReturnType<typeof client.admin.listPayments>
>["items"][number];

function formatIdr(value: number) {
  return `Rp${value.toLocaleString("id-ID")}`;
}

function formatMarks(value: number) {
  return value.toLocaleString("id-ID");
}

function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(value instanceof Date ? value : new Date(value));
}

function toIsoStartOfWibDay(value: string) {
  return new Date(`${value}T00:00:00+07:00`).toISOString();
}

function toIsoEndOfWibDay(value: string) {
  return new Date(`${value}T23:59:59.999+07:00`).toISOString();
}

function statusVariant(status: PaymentStatus) {
  if (status === "PAID" || status === "SETTLED") return "success" as const;
  if (status === "FAILED" || status === "EXPIRED") return "danger" as const;
  if (status === "REFUNDED") return "secondary" as const;
  return "warning" as const;
}

function canRefund(status: PaymentStatus) {
  return status === "PAID" || status === "SETTLED";
}

export function AdminPaymentsPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [search, setSearch] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(0);
  const [pageCursors, setPageCursors] = useState<Array<string | undefined>>([
    undefined,
  ]);
  const [refundTarget, setRefundTarget] = useState<PaymentRow | null>(null);
  const [refundReason, setRefundReason] = useState("");

  const cursor = pageCursors[page];
  const query = useQuery({
    ...orpc.admin.listPayments.queryOptions({
      input: {
        limit: PAGE_SIZE,
        ...(status !== "ALL" ? { status } : {}),
        ...(submittedQuery ? { query: submittedQuery } : {}),
        ...(dateFrom ? { dateFrom: toIsoStartOfWibDay(dateFrom) } : {}),
        ...(dateTo ? { dateTo: toIsoEndOfWibDay(dateTo) } : {}),
        ...(cursor ? { cursor } : {}),
      },
    }),
    placeholderData: keepPreviousData,
  });
  const rows = query.data?.items ?? [];

  const refundMutation = useMutation(
    orpc.adminBooking.adminRefund.mutationOptions({
      onSuccess: () => {
        setRefundTarget(null);
        setRefundReason("");
        void queryClient.invalidateQueries({
          queryKey: orpc.admin.listPayments.key(),
        });
        toastManager.add({
          title: "Refund recorded",
          description:
            "The payment refund is saved and the Mark balance correction is complete.",
          type: "success",
        });
      },
      onError: (error: unknown) =>
        toastManager.add({
          title: "Refund could not be recorded",
          description: getUserFacingError(error),
          type: "error",
        }),
    }),
  );

  function resetPagination() {
    setPage(0);
    setPageCursors([undefined]);
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextQuery = search.trim();
    if (nextQuery.length === 1) return;
    setSubmittedQuery(nextQuery);
    resetPagination();
  }

  function resetFilters() {
    setStatus("ALL");
    setSearch("");
    setSubmittedQuery("");
    setDateFrom("");
    setDateTo("");
    resetPagination();
  }

  function nextPage() {
    const nextCursor = query.data?.nextCursor;
    if (!nextCursor) return;

    setPageCursors((current) => {
      const next = current.slice(0, page + 1);
      next.push(nextCursor);
      return next;
    });
    setPage((current) => current + 1);
  }

  const hasActiveFilters =
    status !== "ALL" ||
    submittedQuery !== "" ||
    dateFrom !== "" ||
    dateTo !== "";

  return (
    <Stack
      direction="column"
      spacing="lg"
      className="w-full min-w-0 max-w-full"
    >
      <div>
        <Heading level={1} size="md">
          Payments
        </Heading>
        <Text className="max-w-full text-muted">
          Review payment attempts, provider references, and issue refunds for
          successful top-ups.
        </Text>
      </div>

      <form
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"
        onSubmit={submitSearch}
      >
        <Field className="min-w-0">
          <FieldLabel>Status</FieldLabel>
          <Select
            value={status}
            onValueChange={(value) => {
              setStatus(getSelectItemValue(value) as StatusFilter);
              resetPagination();
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectPopup>
              <SelectList>
                <SelectItem value="ALL">All statuses</SelectItem>
                {PAYMENT_STATUSES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectList>
            </SelectPopup>
          </Select>
        </Field>
        <Field className="min-w-0 xl:col-span-2">
          <FieldLabel htmlFor="payment-search">Search</FieldLabel>
          <div className="flex gap-2">
            <Input
              id="payment-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name, email, or provider reference"
              autoComplete="off"
              className="min-w-0 flex-1"
            />
            <Button
              type="submit"
              variant="secondary"
              disabled={search.trim().length < 2}
            >
              <IconSearch /> Search
            </Button>
          </div>
        </Field>
        <Field className="min-w-0">
          <FieldLabel htmlFor="payment-date-from">From (WIB)</FieldLabel>
          <Input
            id="payment-date-from"
            type="date"
            value={dateFrom}
            max={dateTo || undefined}
            onChange={(event) => {
              setDateFrom(event.target.value);
              resetPagination();
            }}
          />
        </Field>
        <Field className="min-w-0">
          <FieldLabel htmlFor="payment-date-to">To (WIB)</FieldLabel>
          <Input
            id="payment-date-to"
            type="date"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(event) => {
              setDateTo(event.target.value);
              resetPagination();
            }}
          />
        </Field>
        <div className="flex items-end sm:col-span-2 xl:col-span-5">
          <Button
            type="button"
            variant="outline"
            disabled={!hasActiveFilters}
            onClick={resetFilters}
          >
            <IconRefresh /> Reset filters
          </Button>
          {query.data ? (
            <Text className="ml-auto text-sm text-muted">
              {query.data.total.toLocaleString("id-ID")} payments
            </Text>
          ) : null}
        </div>
      </form>

      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState
          message={getUserFacingError(
            query.error,
            "The payment list could not be loaded.",
          )}
          onRetry={() => void query.refetch()}
        />
      ) : rows.length === 0 ? (
        <>
          <EmptyState
            icon={<IconInbox />}
            title={
              page === 0 ? "No matching payments" : "No payments on this page"
            }
            description={
              page === 0
                ? "Try a different status, search, or date range."
                : "Go back to the previous page to continue browsing payments."
            }
            tone="secondary"
            size="compact"
          />
          {page > 0 ? (
            <TablePagination
              targetId="admin-payments"
              label="payments"
              pageSize={PAGE_SIZE}
              page={page}
              itemCount={0}
              hasNext={false}
              isFetching={query.isFetching}
              onPrevious={() => setPage((current) => Math.max(0, current - 1))}
              onNext={nextPage}
            />
          ) : null}
        </>
      ) : (
        <div id="admin-payments" className="min-w-0">
          <TableContainer className="min-w-0 max-w-none">
            <Table className="min-w-[72rem] text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-40 whitespace-nowrap">
                    Created (WIB)
                  </TableHead>
                  <TableHead className="w-56">User</TableHead>
                  <TableHead className="w-44">Purchase</TableHead>
                  <TableHead className="w-32 whitespace-nowrap">
                    Amount
                  </TableHead>
                  <TableHead className="w-24 whitespace-nowrap">
                    Marks
                  </TableHead>
                  <TableHead className="w-44">Status</TableHead>
                  <TableHead className="w-52">Provider reference</TableHead>
                  <TableHead className="w-28">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap text-muted">
                      {formatDate(row.createdAt)}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{row.userName}</div>
                      <Text className="break-all text-muted">
                        {row.userEmail}
                      </Text>
                    </TableCell>
                    <TableCell>{row.purchaseLabel ?? "Not labeled"}</TableCell>
                    <TableCell className="whitespace-nowrap font-medium">
                      {formatIdr(row.amountIdr)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatMarks(row.marks)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(row.status)}>
                        {row.status}
                      </Badge>
                      {row.providerRefundKind ? (
                        <Text className="mt-1 text-muted">
                          {row.providerRefundKind === "full"
                            ? "Full provider refund"
                            : "Partial provider refund"}
                          {row.providerRefundAmountIdr == null
                            ? ""
                            : ` · ${formatIdr(row.providerRefundAmountIdr)}`}
                        </Text>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Text className="text-muted">{row.provider}</Text>
                      <Text className="break-all font-mono text-xs">
                        {row.providerReference}
                      </Text>
                    </TableCell>
                    <TableCell>
                      {canRefund(row.status) ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          aria-label={`Refund payment for ${row.userName}`}
                          onClick={() => {
                            setRefundReason("");
                            setRefundTarget(row);
                          }}
                        >
                          Refund
                        </Button>
                      ) : (
                        <Text className="text-muted">—</Text>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            targetId="admin-payments"
            label="payments"
            pageSize={PAGE_SIZE}
            page={page}
            itemCount={rows.length}
            hasNext={Boolean(query.data?.nextCursor)}
            isFetching={query.isFetching}
            onPrevious={() => setPage((current) => Math.max(0, current - 1))}
            onNext={nextPage}
          />
        </div>
      )}

      <ConfirmationDialog
        open={Boolean(refundTarget)}
        onOpenChange={(open) => {
          if (open) return;
          setRefundTarget(null);
          setRefundReason("");
        }}
        title="Refund payment"
        description={
          refundTarget ? (
            <>
              Refund {formatIdr(refundTarget.amountIdr)} for{" "}
              {refundTarget.userName} ({refundTarget.userEmail}). This reverses
              the unspent Marks from this payment, marks it refunded, and
              records the reason in the audit log. No money is returned to the
              payment method; provider-side cash refunds stay manual.
            </>
          ) : null
        }
        confirmLabel="Issue refund"
        confirmVariant="danger"
        pending={refundMutation.isPending}
        confirmDisabled={refundReason.trim().length === 0}
        onConfirm={() => {
          if (!refundTarget) return;
          refundMutation.mutate({
            paymentId: refundTarget.id,
            reason: refundReason.trim(),
          });
        }}
      >
        <Field>
          <FieldLabel htmlFor="refund-reason" required>
            Reason
          </FieldLabel>
          <Textarea
            id="refund-reason"
            value={refundReason}
            onChange={(event) => setRefundReason(event.target.value)}
            placeholder="Why is this payment being refunded?"
            maxLength={2000}
          />
          <FieldDescription>{refundReason.length}/2000</FieldDescription>
        </Field>
      </ConfirmationDialog>
    </Stack>
  );
}

function LoadingState() {
  return (
    <div className="flex min-h-48 items-center justify-center">
      <Loader />
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center text-center">
      <IconBox variant="danger-subtle">
        <IconAlertTriangle />
      </IconBox>
      <Text className="mt-3">Payments could not be loaded</Text>
      <Text className="mt-1 text-muted">{message}</Text>
      <Button className="mt-4" variant="secondary" onClick={onRetry}>
        <IconRefresh /> Try again
      </Button>
    </div>
  );
}
