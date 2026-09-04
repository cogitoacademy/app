"use client";

import { useQuery } from "@tanstack/react-query";

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
        <>
          <img
            src="/cogito-mark.png"
            alt=""
            aria-hidden="true"
            width={12}
            height={12}
            className="size-3 w-auto"
          />
          <span>{balance}</span>
        </>
      )}
    </div>
  );
}
