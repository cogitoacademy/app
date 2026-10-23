"use client";

import { Button } from "@cogito-app/ui/components/selia/button";
import { Field, FieldLabel } from "@cogito-app/ui/components/selia/field";
import { Input } from "@cogito-app/ui/components/selia/input";
import { KolSettlementPanel } from "./kol-settlement-panel";
import { Badge } from "@cogito-app/ui/components/selia/badge";
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import { Heading } from "@cogito-app/ui/components/selia/heading";
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
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { client, orpc } from "@/utils/orpc";
import { TablePagination } from "@/components/table-pagination";

const PAGE_SIZE = 50;
type CommissionPage = Awaited<
  ReturnType<typeof client.adminReferral.listKolCommissions>
>;
type CommissionRow = CommissionPage["items"][number];

function formatIdr(value: number) {
  return `Rp${value.toLocaleString("id-ID")}`;
}

function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Jakarta",
  }).format(value instanceof Date ? value : new Date(value));
}

function paymentStatusVariant(status: string) {
  if (status === "REFUNDED") return "danger" as const;
  if (status === "PAID" || status === "SETTLED") return "success" as const;
  return "warning" as const;
}

export function AdminKolCommissionsPage() {
  const [selected, setSelected] = useState<CommissionRow | null>(null);
  const [month, setMonth] = useState(
    new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
    }).format(new Date()),
  );
  const exporter = useMutation({
    mutationFn: () => client.adminReferral.exportKolMonthly({ month }),
    onSuccess: (result) => {
      const url = URL.createObjectURL(
        new Blob([result.csv], { type: "text/csv;charset=utf-8" }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.filename;
      anchor.click();
      URL.revokeObjectURL(url);
    },
  });
  const [page, setPage] = useState(0);
  const [pageCursors, setPageCursors] = useState<Array<string | undefined>>([
    undefined,
  ]);
  const cursor = pageCursors[page];
  const query = useQuery({
    ...orpc.adminReferral.listKolCommissions.queryOptions({
      input: { limit: PAGE_SIZE, ...(cursor ? { cursor } : {}) },
    }),
    placeholderData: keepPreviousData,
  });
  const rows = query.data?.items ?? [];

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

  return (
    <div id="admin-kol-commissions" className="space-y-6">
      <header className="space-y-2">
        <Heading level={1}>KOL commission decisions</Heading>
        <Text className="text-muted">
          First eligible top-up decisions use the terms saved at signup. Amounts
          below are calculated commissions. Open settlement history to record
          actual transfers or explicit obligation adjustments.
        </Text>
      </header>

      <Card>
        <CardBody>
          <Text>
            Partial refunds retain their historical calculation and require
            manual reconciliation; no proration is calculated. Full reversals
            void the obligation while preserving external transfers. No
            automatic recovery or future offset is made.
          </Text>
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-3">
          <Field>
            <FieldLabel>Activity month (WIB)</FieldLabel>
            <Input
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
            />
          </Field>
          <Text>
            CSV includes purchases and settlement activity in this month, with
            current lifetime balances. Summary amounts repeat on detail rows;
            sum summary rows only.
          </Text>
          <Button
            disabled={!month || exporter.isPending}
            onClick={() => exporter.mutate()}
          >
            Export monthly reconciliation CSV
          </Button>
          {exporter.isError ? (
            <Text role="alert" className="text-danger">
              {exporter.error.message}
            </Text>
          ) : null}
        </CardBody>
      </Card>
      {selected ? (
        <div className="space-y-2">
          <Button variant="plain" onClick={() => setSelected(null)}>
            Close settlement
          </Button>
          <KolSettlementPanel
            key={selected.id}
            decisionId={selected.id}
            label={`${selected.campaignName} · ${selected.referredUserEmail}`}
          />
        </div>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Latest decisions</CardTitle>
        </CardHeader>
        <CardBody>
          {query.isPending ? (
            <Text className="text-muted">Loading commission decisions…</Text>
          ) : query.isError ? (
            <Text className="text-danger">
              Commission decisions could not be loaded. Refresh to try again.
            </Text>
          ) : rows.length === 0 ? (
            <Text className="text-muted">No KOL commission decisions yet.</Text>
          ) : (
            <TableContainer>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campaign / student</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Provider success (WIB)</TableHead>
                    <TableHead>Saved base / terms</TableHead>
                    <TableHead>Commission</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row: CommissionRow) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="font-medium">{row.campaignName}</div>
                        <Text className="text-muted">
                          {row.code} · {row.referredUserName ?? "Student"}
                        </Text>
                        <Text className="text-muted">
                          {row.referredUserEmail}
                        </Text>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={paymentStatusVariant(row.paymentStatus)}
                        >
                          {row.paymentStatus}
                        </Badge>
                        <Text className="text-muted">
                          {row.paymentReference ?? row.paymentId}
                        </Text>
                        {row.refundReconciliationState === "partial_refund" ? (
                          <div className="mt-1">
                            <Badge variant="warning">
                              Partial refund · reconcile
                            </Badge>
                            <Text className="text-muted">
                              Provider refund amount:{" "}
                              {row.providerRefundAmountIdr == null
                                ? "unavailable"
                                : formatIdr(row.providerRefundAmountIdr)}
                            </Text>
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {row.providerSuccessTimeState === "unresolved" ? (
                          <div>
                            <Badge variant="warning">Time unresolved</Badge>
                            <Text className="text-muted">
                              Commission held; provider has not supplied an
                              authoritative success time.
                            </Text>
                          </div>
                        ) : row.providerSuccessAt ? (
                          formatDate(row.providerSuccessAt)
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        <div>{formatIdr(row.purchaseAmountIdr)}</div>
                        <Text className="text-muted">
                          {formatIdr(row.flatAmountIdr)} +{" "}
                          {row.percentBps / 100}%
                        </Text>
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatIdr(row.commissionAmountIdr)}
                        <Button
                          variant="plain"
                          onClick={() => setSelected(row)}
                        >
                          View settlement
                        </Button>
                        {row.refundReconciliationState === "partial_refund" ? (
                          <Text className="text-warning-foreground">
                            Historical calculation; manual reconciliation
                            required.
                          </Text>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
          {!query.isPending &&
          !query.isError &&
          (rows.length > 0 || page > 0) ? (
            <TablePagination
              targetId="admin-kol-commissions"
              label="commission decisions"
              pageSize={PAGE_SIZE}
              page={page}
              itemCount={rows.length}
              hasNext={Boolean(query.data?.nextCursor)}
              isFetching={query.isFetching}
              onPrevious={() => setPage((current) => Math.max(0, current - 1))}
              onNext={nextPage}
            />
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}
