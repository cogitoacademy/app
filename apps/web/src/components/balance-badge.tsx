"use client";

import { useQuery } from "@tanstack/react-query";

import { CogitoMarks } from "@/components/cogito-marks";
import { orpc } from "@/utils/orpc";

export function BalanceBadge() {
  const { data: wallet, isLoading } = useQuery(orpc.wallet.get.queryOptions());

  const balance = wallet?.availableBalance ?? 0;
  // const isEmpty = balance === 0;

  return (
    <div
      className="flex items-center gap-1.5 text-base font-semibold text-foreground px-2"
      title="Balance"
    >
      {/* <IconWallet className="size-4 text-muted" /> */}
      {isLoading ? (
        <span className="text-muted">—</span>
      ) : (
        <CogitoMarks value={balance} size="3" />
      )}
    </div>
  );
}
