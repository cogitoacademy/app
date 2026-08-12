"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Card,
  CardBody,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { Separator } from "@cogito-app/ui/components/selia/separator";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import { Text } from "@cogito-app/ui/components/selia/text";
import {
  IconBook,
  IconCoin,
  IconLock,
  IconLockOpen,
  IconShoppingCart,
  IconWallet,
  IconLoader2,
  IconArrowDown,
  IconArrowUp,
  IconArrowsExchange,
} from "@tabler/icons-react";
import { cn } from "@cogito-app/ui/lib/utils";

import { StatCard } from "../stat-card";
import { orpc } from "@/utils/orpc";

const LEDGER_LABELS: Record<string, string> = {
  credit: "Marks added",
  hold: "Marks reserved",
  release: "Marks released",
  deduct: "Session payment",
  compensate_credit: "Balance correction",
  compensate_deduct: "Balance correction",
};

type LedgerEntry = {
  id: string;
  entryType: string;
  amount: number;
  afterBalance: number;
  reason: string | null;
  createdAt: string | Date;
};

function getLedgerDirection(entryType: string) {
  if (entryType === "credit" || entryType === "compensate_credit") return 1;
  if (entryType === "deduct" || entryType === "compensate_deduct") return -1;
  return 0;
}

function formatIdr(amount: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(amount);
}

export function BalancePage() {
  const queryClient = useQueryClient();
  const [buying, setBuying] = useState(false);

  const { data: wallet, isLoading: walletLoading } = useQuery(
    orpc.wallet.get.queryOptions(),
  );
  const { data: packages = [], isLoading: packagesLoading } = useQuery(
    orpc.wallet.listPackages.queryOptions(),
  );
  const { data: ledgerData, isLoading: ledgerLoading } = useQuery(
    orpc.wallet.listLedger.queryOptions({ input: { limit: 50 } }),
  );
  const ledger = ledgerData as
    | { items: LedgerEntry[]; nextCursor: string | null }
    | undefined;

  const purchase = useMutation(
    orpc.payment.createPurchase.mutationOptions({
      onSuccess: async (res) => {
        setBuying(true);
        if (res.checkoutUrl) {
          await fetch(res.checkoutUrl, { credentials: "include" });
        }
        await queryClient.invalidateQueries({
          queryKey: orpc.wallet.get.queryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: orpc.wallet.listLedger.key(),
        });
        setBuying(false);
      },
    }),
  );

  const totalBalance = wallet?.totalBalance ?? 0;
  const heldBalance = wallet?.heldBalance ?? 0;
  const availableBalance = wallet?.availableBalance ?? 0;
  const kbAccessible = totalBalance >= 35;

  return (
    <Stack direction="column" spacing="lg">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard
          icon={<IconWallet />}
          title="Total Balance"
          value={
            <span className="inline-flex items-center gap-1.5">
              {walletLoading ? "—" : totalBalance}
              <img
                src="/cogito-mark.png"
                className="h-[0.75em] w-auto"
                alt=""
              />
            </span>
          }
          change={`${kbAccessible ? "✓" : "✗"} Knowledge Bank`}
          changeType={kbAccessible ? "increase" : "decrease"}
        />
        <StatCard
          icon={<IconLock />}
          title="Held Balance"
          value={
            <span className="inline-flex items-center gap-1.5">
              {walletLoading ? "—" : heldBalance}
              <img
                src="/cogito-mark.png"
                className="h-[0.75em] w-auto"
                alt=""
              />
            </span>
          }
          change="In active bookings"
          changeType="decrease"
        />
        <StatCard
          icon={<IconCoin />}
          title="Available Balance"
          value={
            <span className="inline-flex items-center gap-1.5">
              {walletLoading ? "—" : availableBalance}
              <img
                src="/cogito-mark.png"
                className="h-[0.75em] w-auto"
                alt=""
              />
            </span>
          }
          change="Ready to spend"
          changeType="increase"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Knowledge Bank Access</CardTitle>
          <CardDescription>
            Knowledge Bank access requires at least 35 Marks in your wallet. You
            are not paying 35 Marks to open it.
          </CardDescription>
        </CardHeader>
        <CardBody>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-3 rounded-lg border border-border p-4">
            {kbAccessible ? (
              <IconBook className="size-6 text-success" />
            ) : (
              <IconLockOpen className="size-6 text-danger" />
            )}
            <div>
              <Heading size="sm">
                {kbAccessible
                  ? "You have access"
                  : `${Math.max(0, 35 - totalBalance)} Marks needed`}
              </Heading>
              <Text className="text-dimmed text-sm">
                {kbAccessible
                  ? "You meet the 35-Mark threshold. Visit the Knowledge Bank to explore materials."
                  : "Top up your wallet to unlock the Knowledge Bank."}
              </Text>
            </div>
            {kbAccessible ? (
              <Button
                className="w-full sm:ml-auto sm:w-auto sm:shrink-0 group"
                render={
                  <a
                    href="https://knowledge.cogito.academy"
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Open Knowledge Bank"
                  />
                }
                nativeButton={false}
              >
                Open Knowledge Bank
              </Button>
            ) : (
              <Button
                className="w-full sm:ml-auto sm:w-auto sm:shrink-0"
                variant="secondary"
                render={<a href="#top-up-marks" aria-label="Top up wallet" />}
                nativeButton={false}
              >
                Top up wallet
              </Button>
            )}
          </div>
        </CardBody>
      </Card>

      <Card id="top-up-marks">
        <CardHeader>
          <CardTitle>Top Up Marks</CardTitle>
          <CardDescription>
            Choose a package to add Marks to your wallet
          </CardDescription>
        </CardHeader>
        <CardBody>
          <div className="rounded-lg border border-border bg-card p-4 mb-4">
            <Heading size="sm" className="mb-1">
              Test mode active
            </Heading>
            <Text className="text-dimmed text-sm">
              Payments currently use the stub provider (
              <code className="rounded bg-item px-1 text-xs">
                PAYMENT_PROVIDER=stub
              </code>
              ). Clicking <strong>Buy</strong> adds Marks immediately without
              real money. To switch to Xendit, set{" "}
              <code className="rounded bg-item px-1 text-xs">
                PAYMENT_PROVIDER=xendit
              </code>{" "}
              and provide{" "}
              <code className="rounded bg-item px-1 text-xs">
                XENDIT_SECRET_KEY
              </code>{" "}
              plus webhook credentials.
            </Text>
          </div>
          {packagesLoading ? (
            <Text className="text-muted">Loading packages...</Text>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              {packages.toReversed().map((pkg) => (
                <Card
                  key={pkg.code}
                  className={cn(
                    pkg.code === "explorer" ? "border-primary" : "",
                    "h-fit",
                  )}
                >
                  <CardHeader>
                    <CardTitle>{pkg.name}</CardTitle>
                  </CardHeader>
                  <CardBody>
                    <div className="space-y-1">
                      <Text className="text-3xl font-bold">
                        <span className="inline-flex items-center gap-1.5">
                          {pkg.marks}
                          <img
                            src="/cogito-mark.png"
                            className="h-[0.75em] w-auto translate-y-[-0.05em]"
                            alt=""
                          />
                        </span>
                      </Text>
                    </div>
                    <Separator className="my-3" />
                    <div className="space-y-1">
                      <Text className="text-lg font-semibold">
                        {formatIdr(pkg.priceIdr)}
                      </Text>
                      <Text className="text-dimmed text-xs">
                        ~{formatIdr(Math.round(pkg.priceIdr / pkg.marks))}/Mark
                      </Text>
                    </div>
                  </CardBody>
                  <CardFooter>
                    <Button
                      block
                      progress={buying}
                      disabled={buying}
                      onClick={() => purchase.mutate({ packageCode: pkg.code })}
                    >
                      {buying ? (
                        <IconLoader2 className="animate-spin" />
                      ) : (
                        <IconShoppingCart />
                      )}
                      Buy
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Marks history</CardTitle>
          <CardDescription>
            Top-ups, booking reservations, releases, and completed session
            payments
          </CardDescription>
        </CardHeader>
        <CardBody>
          {ledgerLoading ? (
            <Text className="text-muted">Loading transaction history...</Text>
          ) : !ledger?.items.length ? (
            <div className="rounded-lg border border-border p-6 text-center">
              <Text className="font-medium">No transactions yet</Text>
              <Text className="mt-1 text-sm text-muted">
                Your top-ups and booking activity will appear here.
              </Text>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {ledger.items.map((entry) => {
                const direction = getLedgerDirection(entry.entryType);
                const EntryIcon =
                  direction > 0
                    ? IconArrowDown
                    : direction < 0
                      ? IconArrowUp
                      : IconArrowsExchange;

                return (
                  <div
                    key={entry.id}
                    className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-muted">
                      <EntryIcon className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <Text className="font-medium">
                        {LEDGER_LABELS[entry.entryType] ?? "Marks activity"}
                      </Text>
                      <Text className="truncate text-sm text-muted">
                        {entry.reason ?? "Cogito Marks transaction"} ·{" "}
                        {new Intl.DateTimeFormat("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        }).format(new Date(entry.createdAt))}
                      </Text>
                    </div>
                    <div className="text-right">
                      <Text
                        className={cn(
                          "font-semibold",
                          direction > 0
                            ? "text-success"
                            : direction < 0
                              ? "text-danger"
                              : "text-foreground",
                        )}
                      >
                        {direction > 0 ? "+" : direction < 0 ? "-" : ""}
                        {entry.amount} Marks
                      </Text>
                      <Text className="text-sm text-muted">
                        Balance {entry.afterBalance}
                      </Text>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardBody>
      </Card>
    </Stack>
  );
}
