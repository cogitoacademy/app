"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@cogito-app/ui/components/selia/button";
import { Badge } from "@cogito-app/ui/components/selia/badge";
import {
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  CardInfoPreview,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { IconBox } from "@cogito-app/ui/components/selia/icon-box";
import {
  Drawer,
  DrawerBody,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerPopup,
  DrawerTitle,
} from "@cogito-app/ui/components/selia/drawer";
import { Separator } from "@cogito-app/ui/components/selia/separator";
import { Stack } from "@cogito-app/ui/components/selia/stack";
import { Text } from "@cogito-app/ui/components/selia/text";
import { toastManager } from "@cogito-app/ui/components/selia/toast";
import {
  IconBook,
  IconLockOpen,
  IconShoppingCart,
  IconUsers,
  IconLoader2,
  IconArrowDown,
  IconArrowUp,
  IconArrowsExchange,
} from "@tabler/icons-react";
import { cn } from "@cogito-app/ui/lib/utils";
import { Link } from "@tanstack/react-router";

import { EmptyState } from "@/components/empty-state";
import { CogitoMarks } from "@/components/cogito-marks";
import { BalanceWidget } from "@/components/dashboard/balance-widget";
import { InfoPreview } from "@/components/info-preview";
import { orpc } from "@/utils/orpc";
import { getUserFacingError } from "@/lib/error-message";

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
  return `Rp${amount.toLocaleString("id-ID")}`;
}

export function BalancePage() {
  const queryClient = useQueryClient();
  const [selectedPackageCode, setSelectedPackageCode] = useState<string | null>(
    null,
  );
  const [paymentDrawerOpen, setPaymentDrawerOpen] = useState(false);
  const { data: wallet, isLoading: walletLoading } = useQuery(
    orpc.wallet.get.queryOptions(),
  );
  const { data: packagesData, isLoading: packagesLoading } = useQuery(
    orpc.wallet.listPackages.queryOptions(),
  );
  const { data: paymentConfig } = useQuery(
    orpc.payment.getConfig.queryOptions(),
  );
  const packages = packagesData?.packages ?? [];
  const selectedPackage = packages.find(
    (pkg) => pkg.code === selectedPackageCode,
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
        if (res.checkoutUrl) {
          window.location.assign(res.checkoutUrl);
          return;
        }
        await queryClient.invalidateQueries({
          queryKey: orpc.wallet.get.queryKey(),
        });
        await queryClient.invalidateQueries({
          queryKey: orpc.wallet.listLedger.key(),
        });
      },
      onError: (error: Error) =>
        toastManager.add({
          title: "Purchase could not be completed",
          description: getUserFacingError(error),
          type: "error",
        }),
    }),
  );

  const totalBalance = wallet?.totalBalance ?? 0;
  const heldBalance = wallet?.heldBalance ?? 0;
  const availableBalance = wallet?.availableBalance ?? 0;
  const kbAccessible = totalBalance >= 35;

  return (
    <Stack
      className="w-full min-w-0 max-w-full"
      direction="column"
      spacing="lg"
    >
      <div className="grid min-w-0 grid-cols-1 items-stretch gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <div>
            <Heading level={1} size="md">
              Manage your Marks
            </Heading>
            <Text className="text-muted">
              See what’s available, review active holds, and top up when you
              need to.
            </Text>
          </div>
          <Card className="min-w-0 mb-0 mt-auto">
            <CardBody className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:p-5">
              <IconBox variant="tertiary">
                {kbAccessible ? <IconBook /> : <IconLockOpen />}
              </IconBox>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <Heading size="sm">Knowledge Bank</Heading>
                  <InfoPreview
                    title="Knowledge Bank access"
                    description={
                      <>
                        Keep at least
                        <CogitoMarks value={35} size="3" className="mx-1" />
                        in your total wallet balance to unlock the Knowledge
                        Bank. The Marks are not charged when you open it.
                      </>
                    }
                  />
                </div>
                <Text className="text-dimmed text-sm">
                  {kbAccessible ? (
                    "Unlocked — explore your learning materials."
                  ) : (
                    <>
                      <CogitoMarks
                        value={Math.max(0, 35 - totalBalance)}
                        size="3"
                        className="mr-1"
                      />
                      more to unlock.
                    </>
                  )}
                </Text>
              </div>
              {kbAccessible ? (
                <Button
                  className="col-span-2 w-full sm:col-span-1 sm:w-auto sm:shrink-0"
                  render={
                    <Link
                      to="/knowledge-bank"
                      aria-label="Open Knowledge Bank"
                    />
                  }
                  nativeButton={false}
                >
                  Open
                </Button>
              ) : (
                <Button
                  className="col-span-2 w-full sm:col-span-1 sm:w-auto sm:shrink-0"
                  variant="secondary"
                  render={<a href="#top-up-marks" aria-label="Top up wallet" />}
                  nativeButton={false}
                >
                  Top up
                </Button>
              )}
            </CardBody>
          </Card>
        </div>
        <div className="min-w-0 [&>*]:h-full">
          <BalanceWidget
            availableBalance={availableBalance}
            heldBalance={heldBalance}
            totalBalance={totalBalance}
            isLoading={walletLoading}
            actionLabel="Find a tutor"
            actionHref="/tutors"
            actionIcon={<IconUsers />}
          />
        </div>
      </div>

      <Card id="top-up-marks" className="w-full min-w-0 max-w-full">
        <CardHeader>
          <CardTitle>
            Top Up Marks
            {paymentConfig?.testMode ? (
              <Badge variant="warning">Test mode</Badge>
            ) : null}
            <CardInfoPreview>
              <InfoPreview
                title="Top Up Marks"
                description="Choose a package to add Marks to your wallet."
              />
            </CardInfoPreview>
          </CardTitle>
        </CardHeader>
        <CardBody>
          {packagesLoading ? (
            <Text className="text-muted">Loading packages...</Text>
          ) : packages.length === 0 ? (
            <EmptyState
              icon={<IconShoppingCart />}
              title="No Marks packages available"
              description="Top-up packages will appear here when they are available."
              tone="secondary"
              size="compact"
              className="rounded-lg border border-border"
            />
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
                        <CogitoMarks value={pkg.marks} size="5" />
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
                      onClick={() => {
                        purchase.reset();
                        setSelectedPackageCode(pkg.code);
                        setPaymentDrawerOpen(true);
                      }}
                    >
                      <IconShoppingCart />
                      Buy
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <Drawer
        open={paymentDrawerOpen}
        onOpenChange={(open) => {
          if (!purchase.isPending) setPaymentDrawerOpen(open);
        }}
        swipeDirection="down"
      >
        <DrawerPopup direction="bottom" className="mx-auto max-w-xl">
          <DrawerHeader className="flex-col items-start gap-1.5 border-b border-drawer-border pb-4.5">
            <DrawerTitle>Review your top-up</DrawerTitle>
            <DrawerDescription>
              Confirm your Marks package before continuing to payment.
            </DrawerDescription>
          </DrawerHeader>
          <DrawerBody className="space-y-4">
            {selectedPackage ? (
              <div className="rounded-lg border border-item-border bg-item p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Text className="font-semibold">
                      {selectedPackage.name}
                    </Text>
                    <Text className="text-dimmed text-sm">
                      <CogitoMarks value={selectedPackage.marks} size="3" />
                    </Text>
                  </div>
                  <Text className="font-semibold">
                    {formatIdr(selectedPackage.priceIdr)}
                  </Text>
                </div>
              </div>
            ) : null}
          </DrawerBody>
          {selectedPackage ? (
            <DrawerFooter>
              <Button
                block
                progress={purchase.isPending}
                disabled={purchase.isPending}
                onClick={() =>
                  purchase.mutate({ packageCode: selectedPackage.code })
                }
              >
                {purchase.isPending ? (
                  <IconLoader2 className="animate-spin" />
                ) : null}
                Continue payment · {formatIdr(selectedPackage.priceIdr)}
              </Button>
            </DrawerFooter>
          ) : null}
        </DrawerPopup>
      </Drawer>

      <Card className="w-full min-w-0 max-w-full">
        <CardHeader>
          <CardTitle>
            Marks history
            <CardInfoPreview>
              <InfoPreview
                title="Marks history"
                description="Top-ups, booking reservations, releases, and completed session payments."
              />
            </CardInfoPreview>
          </CardTitle>
        </CardHeader>
        <CardBody className="min-w-0 overflow-hidden">
          {ledgerLoading ? (
            <Text className="text-muted">Loading transaction history...</Text>
          ) : !ledger?.items.length ? (
            <EmptyState
              icon={<IconArrowsExchange />}
              title="No transactions yet"
              description="Your top-ups and booking activity will appear here."
              tone="secondary"
              size="compact"
              className="rounded-lg border border-border"
            />
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
                    className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[auto_minmax(0,1fr)_auto]"
                  >
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent text-muted">
                      <EntryIcon className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <Text className="font-medium">
                        {LEDGER_LABELS[entry.entryType] ?? "Marks activity"}
                      </Text>
                      <Text className="truncate text-sm text-muted">
                        {entry.reason ?? "Cogito Marks transaction"}
                      </Text>
                      <Text className="text-xs text-dimmed">
                        {new Intl.DateTimeFormat("en-GB", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        }).format(new Date(entry.createdAt))}
                      </Text>
                    </div>
                    <div className="col-start-2 min-w-0 text-left sm:col-start-3 sm:row-start-1 sm:text-right">
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
                        <CogitoMarks
                          value={`${direction > 0 ? "+" : direction < 0 ? "-" : ""}${entry.amount}`}
                          size="4"
                        />
                      </Text>
                      <Text className="inline-flex items-center gap-1 text-sm text-muted sm:justify-end">
                        Balance
                        <CogitoMarks value={entry.afterBalance} size="3" />
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
