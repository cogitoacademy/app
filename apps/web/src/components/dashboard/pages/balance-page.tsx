"use client";

import { NumberField as SeliaNumberField } from "@cogito-app/ui/components/selia/number-field";
import { Field, FieldLabel } from "@cogito-app/ui/components/selia/field";

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

type TopUpPackage = {
  code: string;
  label: string;
  marks: number;
  priceIdr: number;
};

type TopUpQuote = {
  quoteId: string;
  revision: number;
  marks: number;
  customAmountIdr: number;
  exactPackage: TopUpPackage | null;
  recommendedPackage: TopUpPackage | null;
  expiresAt: string;
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
  const [customMarks, setCustomMarks] = useState(100);
  const [topUpQuote, setTopUpQuote] = useState<TopUpQuote | null>(null);
  const { data: wallet, isLoading: walletLoading } = useQuery(
    orpc.wallet.get.queryOptions(),
  );
  const { data: packagesData, isLoading: packagesLoading } = useQuery(
    orpc.wallet.listPackages.queryOptions(),
  );
  const { data: paymentConfig } = useQuery(
    orpc.payment.getConfig.queryOptions(),
  );
  const { data: topUpCatalog, isLoading: topUpCatalogLoading } = useQuery(
    orpc.payment.getTopUpCatalog.queryOptions(),
  );
  const packages = packagesData?.packages ?? [];
  const v3Active = topUpCatalog?.active === true;
  const displayPackages = v3Active
    ? topUpCatalog.packages
    : packages.map((pkg) => ({
        code: pkg.code,
        label: pkg.name,
        marks: pkg.marks,
        priceIdr: pkg.priceIdr,
      }));
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
        toastManager.add({
          title: "Checkout status is being confirmed",
          description:
            "Your payment request is saved. Check back shortly before starting another top-up.",
          type: "warning",
        });
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

  const quoteTopUp = useMutation(
    orpc.payment.createTopUpQuote.mutationOptions({
      onSuccess: (quote) => {
        setTopUpQuote(quote);
        setSelectedPackageCode(null);
        setPaymentDrawerOpen(true);
      },
      onError: (error: Error) =>
        toastManager.add({
          title: "Price could not be calculated",
          description: getUserFacingError(error),
          type: "error",
        }),
    }),
  );

  const purchaseFromQuote = useMutation(
    orpc.payment.createPurchaseFromQuote.mutationOptions({
      onSuccess: async (res) => {
        if (res.checkoutUrl) {
          window.location.assign(res.checkoutUrl);
          return;
        }
        toastManager.add({
          title: "Checkout status is being confirmed",
          description:
            "Your quoted amount and Marks are saved. We will not start a second checkout while the provider status is uncertain.",
          type: "warning",
        });
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
          {packagesLoading || topUpCatalogLoading ? (
            <Text className="text-muted">Loading packages...</Text>
          ) : displayPackages.length === 0 ? (
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
              {displayPackages.toReversed().map((pkg) => (
                <Card
                  key={pkg.code}
                  className={cn(
                    pkg.code === "explorer" || pkg.code === "pioneer"
                      ? "border-primary"
                      : "",
                    "h-fit",
                  )}
                >
                  <CardHeader>
                    <CardTitle>{pkg.label}</CardTitle>
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
                        if (v3Active) {
                          quoteTopUp.mutate({
                            requestKey: crypto.randomUUID(),
                            marks: pkg.marks,
                          });
                        } else {
                          setTopUpQuote(null);
                          setSelectedPackageCode(pkg.code);
                          setPaymentDrawerOpen(true);
                        }
                      }}
                      disabled={quoteTopUp.isPending}
                    >
                      <IconShoppingCart />
                      Buy
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
          {v3Active ? (
            <div className="mt-5 flex flex-col gap-3 rounded-lg border border-card-border bg-card p-4 sm:flex-row sm:items-end sm:justify-between">
              <div className="space-y-1">
                <Text className="font-semibold">Choose an exact amount</Text>
                <Text className="text-sm text-muted">
                  Review the quoted price and any package recommendation before
                  continuing.
                </Text>
              </div>
              <div className="flex flex-col gap-2 sm:min-w-72 sm:flex-row sm:items-end">
                <Field className="min-w-0 flex-1">
                  <FieldLabel htmlFor="custom-marks-amount">Marks</FieldLabel>
                  <SeliaNumberField
                    id="custom-marks-amount"
                    allowOutOfRange
                    format={{ useGrouping: false }}
                    min={1}
                    max={1_000_000}
                    step={1}
                    value={customMarks || null}
                    onValueChange={(nextValue) =>
                      setCustomMarks(nextValue ?? 0)
                    }
                  />
                </Field>
                <Button
                  variant="secondary"
                  disabled={
                    !Number.isInteger(customMarks) ||
                    customMarks < 1 ||
                    customMarks > 1_000_000 ||
                    quoteTopUp.isPending
                  }
                  progress={quoteTopUp.isPending}
                  onClick={() => {
                    purchase.reset();
                    quoteTopUp.mutate({
                      requestKey: crypto.randomUUID(),
                      marks: customMarks,
                    });
                  }}
                >
                  Get a price
                </Button>
              </div>
            </div>
          ) : null}
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
            {topUpQuote ? (
              <div className="space-y-3 rounded-lg border border-item-border bg-item p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Text className="font-semibold">
                      {topUpQuote.exactPackage?.label ?? "Custom top-up"}
                    </Text>
                    <Text className="text-dimmed text-sm">
                      <CogitoMarks value={topUpQuote.marks} size="3" />
                    </Text>
                  </div>
                  <Text className="font-semibold">
                    {formatIdr(
                      topUpQuote.exactPackage?.priceIdr ??
                        topUpQuote.customAmountIdr,
                    )}
                  </Text>
                </div>
                {topUpQuote.recommendedPackage ? (
                  <div className="rounded-md border border-border bg-background p-3">
                    <Text className="font-medium">
                      Recommended: {topUpQuote.recommendedPackage.label}
                    </Text>
                    <Text className="text-sm text-muted">
                      <CogitoMarks
                        value={topUpQuote.recommendedPackage.marks}
                        size="3"
                      />
                      <span className="mx-2">·</span>
                      {formatIdr(topUpQuote.recommendedPackage.priceIdr)}
                    </Text>
                  </div>
                ) : null}
                <Text className="text-xs text-dimmed">
                  Price version {topUpQuote.revision} · valid until{" "}
                  {new Intl.DateTimeFormat("en-GB", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  }).format(new Date(topUpQuote.expiresAt))}
                </Text>
              </div>
            ) : null}
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
          {topUpQuote ? (
            <DrawerFooter className="flex-col">
              {topUpQuote.exactPackage ? (
                <Button
                  block
                  progress={purchaseFromQuote.isPending}
                  disabled={purchaseFromQuote.isPending}
                  onClick={() =>
                    purchaseFromQuote.mutate({
                      quoteId: topUpQuote.quoteId,
                      choice: "package",
                    })
                  }
                >
                  Choose package · {formatIdr(topUpQuote.exactPackage.priceIdr)}
                </Button>
              ) : (
                <>
                  <Button
                    block
                    progress={purchaseFromQuote.isPending}
                    disabled={purchaseFromQuote.isPending}
                    onClick={() =>
                      purchaseFromQuote.mutate({
                        quoteId: topUpQuote.quoteId,
                        choice: "custom",
                      })
                    }
                  >
                    Buy {topUpQuote.marks} Marks ·{" "}
                    {formatIdr(topUpQuote.customAmountIdr)}
                  </Button>
                  {topUpQuote.recommendedPackage ? (
                    <Button
                      block
                      variant="secondary"
                      disabled={purchaseFromQuote.isPending}
                      onClick={() =>
                        purchaseFromQuote.mutate({
                          quoteId: topUpQuote.quoteId,
                          choice: "recommended",
                        })
                      }
                    >
                      Choose {topUpQuote.recommendedPackage.label} ·{" "}
                      {formatIdr(topUpQuote.recommendedPackage.priceIdr)}
                    </Button>
                  ) : null}
                </>
              )}
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
