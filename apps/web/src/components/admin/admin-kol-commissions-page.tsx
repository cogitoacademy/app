"use client";

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
import { useQuery } from "@tanstack/react-query";
import { client, orpc } from "@/utils/orpc";

type CommissionRow = Awaited<
  ReturnType<typeof client.adminReferral.listKolCommissions>
>[number];

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
  const query = useQuery(orpc.adminReferral.listKolCommissions.queryOptions());
  const rows = query.data ?? [];

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Heading level={1}>KOL commission decisions</Heading>
        <Text className="text-muted">
          First eligible top-up decisions use the terms saved at signup. Amounts
          below are calculated commissions; no transfer has been recorded here.
        </Text>
      </header>

      <Card>
        <CardBody>
          <Text>
            Transfers, partial payments, overpayments, CSV exports, and reversal
            adjustments are handled in a later finance slice. A refunded payment
            stays visible and does not reset first-purchase eligibility.
          </Text>
        </CardBody>
      </Card>

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
                      </TableCell>
                      <TableCell>{formatDate(row.providerSuccessAt)}</TableCell>
                      <TableCell>
                        <div>{formatIdr(row.purchaseAmountIdr)}</div>
                        <Text className="text-muted">
                          {formatIdr(row.flatAmountIdr)} +{" "}
                          {row.percentBps / 100}%
                        </Text>
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatIdr(row.commissionAmountIdr)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
