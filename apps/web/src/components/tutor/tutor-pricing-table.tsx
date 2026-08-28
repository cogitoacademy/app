"use client";

import type { ReactNode } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@cogito-app/ui/components/selia/table";

export type TutorPricingModality = "online" | "offline";

export type TutorPricingTableRow = {
  size: string;
  online?: number;
  offline?: number;
};

type TutorPricingTableProps = {
  modalities: readonly TutorPricingModality[];
  rows: readonly TutorPricingTableRow[];
  columnLabels: Record<TutorPricingModality, string>;
  renderValue: (value: number) => ReactNode;
};

export function TutorPricingTable({
  modalities,
  rows,
  columnLabels,
  renderValue,
}: TutorPricingTableProps) {
  const hasOnline = modalities.includes("online");
  const hasOffline = modalities.includes("offline");

  return (
    <div className="overflow-hidden rounded-lg border border-item-border">
      <Table className="text-sm">
        <TableHeader>
          <TableRow>
            <TableHead className="py-2!">Group Size</TableHead>
            {hasOnline ? (
              <TableHead className="py-2! text-right">
                {columnLabels.online}
              </TableHead>
            ) : null}
            {hasOffline ? (
              <TableHead className="py-2! text-right">
                {columnLabels.offline}
              </TableHead>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.size}>
              <TableCell className="py-2!">
                {row.size} student{Number(row.size) > 1 ? "s" : ""}
              </TableCell>
              {hasOnline ? (
                <TableCell className="py-2! text-right font-medium">
                  {row.online !== undefined ? (
                    renderValue(row.online)
                  ) : (
                    <span className="text-dimmed">—</span>
                  )}
                </TableCell>
              ) : null}
              {hasOffline ? (
                <TableCell className="py-2! text-right font-medium">
                  {row.offline !== undefined ? (
                    renderValue(row.offline)
                  ) : (
                    <span className="text-dimmed">—</span>
                  )}
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
