"use client";

import { Button } from "@cogito-app/ui/components/selia/button";
import { Card, CardBody } from "@cogito-app/ui/components/selia/card";
import { Text } from "@cogito-app/ui/components/selia/text";
import { Link } from "@tanstack/react-router";
import { IconWallet } from "@tabler/icons-react";
import type { ReactNode } from "react";

import { CogitoMarks } from "@/components/cogito-marks";

export type BalanceWidgetProps = {
  availableBalance: number;
  heldBalance: number;
  totalBalance: number;
  isLoading?: boolean;
  actionLabel?: string;
  actionHref?: "/balance" | "/tutors";
  actionIcon?: ReactNode;
};

export function BalanceWidget({
  availableBalance,
  heldBalance,
  totalBalance,
  isLoading = false,
  actionLabel = "Top up",
  actionHref = "/balance",
  actionIcon,
}: BalanceWidgetProps) {
  return (
    <div className="rounded-3xl bg-accent p-2">
      <Card className="h-full ring-0">
        <CardBody className="flex h-full flex-col p-4">
          <Text className="pt-1 text-sm text-muted">Available balance</Text>

          <div className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">
            <CogitoMarks value={isLoading ? "—" : availableBalance} size="6" />
          </div>

          <div className="mt-5 flex items-end justify-between gap-4 text-xs">
            <div className="flex flex-col leading-tight">
              <Text className="text-xs text-muted md:text-sm">Held</Text>
              <Text className="mt-1 text-base font-semibold tabular-nums md:text-lg">
                <CogitoMarks value={isLoading ? "—" : heldBalance} />
              </Text>
            </div>
            <div className="flex flex-col items-end leading-tight">
              <Text className="text-xs text-muted md:text-sm">Total</Text>
              <Text className="mt-1 text-base font-semibold tabular-nums md:text-lg">
                <CogitoMarks value={isLoading ? "—" : totalBalance} />
              </Text>
            </div>
          </div>

          <Button
            className="mt-4"
            size="md"
            block
            nativeButton={false}
            render={<Link to={actionHref} aria-label={actionLabel} />}
          >
            {actionIcon ?? <IconWallet />}
            {actionLabel}
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}
