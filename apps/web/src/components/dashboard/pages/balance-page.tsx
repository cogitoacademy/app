"use client";

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
} from "@tabler/icons-react";
import { cn } from "@cogito-app/ui/lib/utils";
import { IconDoorExit } from "@tabler/icons-react";

import { StatCard } from "../stat-card";

const MOCK_WALLET = {
  totalBalance: 350,
  heldBalance: 84,
  availableBalance: 266,
};

const PACKAGES = [
  {
    name: "Starter Pack",
    marks: 50,
    price: "Rp 430,000",
    rate: "~Rp 8,500/Mark",
    popular: false,
  },
  {
    name: "Learner Pack",
    marks: 120,
    price: "Rp 990,000",
    rate: "~Rp 8,200/Mark",
    popular: false,
  },
  {
    name: "Explorer Pack",
    marks: 200,
    price: "Rp 1,570,000",
    rate: "~Rp 7,800/Mark",
    popular: true,
  },
  {
    name: "Pioneer Pack",
    marks: 300,
    price: "Rp 2,180,000",
    rate: "~Rp 7,250/Mark",
    popular: false,
  },
];

const REVERSED_PACKAGES = PACKAGES.map(
  (_, index, packages) => packages[packages.length - 1 - index]!,
);

export function BalancePage() {
  const { totalBalance, heldBalance, availableBalance } = MOCK_WALLET;
  const kbAccessible = totalBalance >= 35;

  return (
    <Stack direction="column" spacing="lg">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard
          icon={<IconWallet />}
          title="Total Balance"
          value={
            <span className="inline-flex items-center gap-1.5">
              {totalBalance}
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
              {heldBalance}
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
              {availableBalance}
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
            Access requires at least 35 Marks in your wallet. Opening the
            Knowledge Bank does not deduct Marks.
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
                  : `$<span className="inline-flex items-center gap-1">
                      {35 - totalBalance}
                      <img src="/cogito-mark.png" className="h-[0.75em] w-auto" alt="" /> needed
                    </span>`}
              </Heading>
              <Text className="text-dimmed text-sm">
                {kbAccessible
                  ? "You meet the 35-Mark threshold. Visit the Knowledge Bank to explore materials."
                  : "Top up your wallet to unlock the Knowledge Bank."}
              </Text>
            </div>
            <Button
              className="w-full sm:w-auto sm:ml-auto sm:shrink-0 group"
              variant={kbAccessible ? "primary" : "secondary"}
              disabled={!kbAccessible}
            >
              Open Knowledge Bank
              <IconDoorExit />
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Top Up Marks</CardTitle>
          <CardDescription>
            Choose a package to add Marks to your wallet
          </CardDescription>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {REVERSED_PACKAGES.map((pkg) => (
              <Card
                key={pkg.name}
                className={cn(pkg.popular ? "border-primary" : "", "h-fit")}
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
                    <Text className="text-lg font-semibold">{pkg.price}</Text>
                    <Text className="text-dimmed text-xs">{pkg.rate}</Text>
                  </div>
                </CardBody>
                <CardFooter>
                  <Button block>
                    <IconShoppingCart /> Buy
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </CardBody>
      </Card>
    </Stack>
  );
}
