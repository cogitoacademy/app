"use client";

import { Badge } from "@cogito-app/ui/components/selia/badge";
import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Card,
  CardBody,
  CardDescription,
  CardFooter,
  CardHeader,
  CardHeaderAction,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { Separator } from "@cogito-app/ui/components/selia/separator";
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
import {
  IconBook,
  IconCoin,
  IconLock,
  IconLockOpen,
  IconShoppingCart,
  IconWallet,
} from "@tabler/icons-react";
import { cn } from "@cogito-app/ui/lib/utils";

import { StatCard } from "../stat-card";

const MOCK_WALLET = {
  totalBalance: 350,
  heldBalance: 84,
  availableBalance: 266,
};

const MOCK_LEDGER: LedgerEntry[] = [
  {
    id: "led-001",
    type: "purchase",
    amount: 300,
    before: 0,
    after: 300,
    reason: "Pioneer Pack purchase",
    date: "2026-06-01T10:30:00Z",
  },
  {
    id: "led-002",
    type: "hold",
    amount: -42,
    before: 300,
    after: 258,
    reason: "Booking hold — Online class for 1",
    date: "2026-06-02T14:00:00Z",
  },
  {
    id: "led-003",
    type: "purchase",
    amount: 50,
    before: 258,
    after: 308,
    reason: "Starter Pack purchase",
    date: "2026-06-03T09:15:00Z",
  },
  {
    id: "led-004",
    type: "release",
    amount: 42,
    before: 258,
    after: 300,
    reason: "Booking cancelled before H-2",
    date: "2026-06-03T11:45:00Z",
  },
  {
    id: "led-005",
    type: "hold",
    amount: -84,
    before: 350,
    after: 266,
    reason: "Booking hold — Online class for 2 (series)",
    date: "2026-06-04T08:00:00Z",
  },
  {
    id: "led-006",
    type: "deduction",
    amount: -42,
    before: 266,
    after: 224,
    reason: "Session completed — Online class for 1",
    date: "2026-06-05T16:00:00Z",
  },
];

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

type EntryType = "purchase" | "hold" | "release" | "deduction" | "refund";

interface LedgerEntry {
  id: string;
  type: EntryType;
  amount: number;
  before: number;
  after: number;
  reason: string;
  date: string;
}

const LEDGER_LABELS: Record<
  EntryType,
  {
    label: string;
    variant: "success" | "info" | "warning" | "danger" | "tertiary";
  }
> = {
  purchase: { label: "Purchase", variant: "success" },
  hold: { label: "Held", variant: "info" },
  release: { label: "Released", variant: "warning" },
  deduction: { label: "Deducted", variant: "danger" },
  refund: { label: "Refund", variant: "tertiary" },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

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
          <div className="flex items-center gap-3 rounded-lg border border-border p-4">
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
              className="ml-auto shrink-0"
              variant={kbAccessible ? "primary" : "secondary"}
              disabled={!kbAccessible}
            >
              Open Knowledge Bank
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
            {PACKAGES.map((pkg) => (
              <Card
                key={pkg.name}
                className={cn(pkg.popular ? "border-primary" : "", "h-fit")}
              >
                <CardHeader>
                  <CardTitle>{pkg.name}</CardTitle>
                  {pkg.popular && <Badge variant="primary">Best Value</Badge>}
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

      <Card>
        <CardHeader>
          <CardTitle>Transaction History</CardTitle>
          <CardHeaderAction>
            <Button variant="secondary" size="sm">
              Export
            </Button>
          </CardHeaderAction>
        </CardHeader>
        <CardBody>
          <TableContainer>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Before</TableHead>
                  <TableHead>After</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {MOCK_LEDGER.map((entry) => {
                  const meta = LEDGER_LABELS[entry.type];
                  return (
                    <TableRow key={entry.id}>
                      <TableCell>
                        <Text className="text-muted text-xs">
                          {formatDate(entry.date)}
                        </Text>
                      </TableCell>
                      <TableCell>
                        <Badge variant={meta.variant}>{meta.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <Text
                          className={
                            entry.amount > 0 ? "text-success" : "text-danger"
                          }
                        >
                          {entry.amount > 0 ? "+" : ""}
                          {entry.amount}
                        </Text>
                      </TableCell>
                      <TableCell>{entry.before}</TableCell>
                      <TableCell>{entry.after}</TableCell>
                      <TableCell>
                        <Text
                          className="text-muted max-w-56 truncate text-xs"
                          title={entry.reason}
                        >
                          {entry.reason}
                        </Text>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </CardBody>
      </Card>
    </Stack>
  );
}
