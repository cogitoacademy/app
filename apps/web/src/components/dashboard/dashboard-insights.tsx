"use client";

import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { IconArrowRight } from "@tabler/icons-react";

import { Button } from "@cogito-app/ui/components/selia/button";
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
} from "@cogito-app/ui/components/selia/card";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { IconBox } from "@cogito-app/ui/components/selia/icon-box";
import { Text } from "@cogito-app/ui/components/selia/text";

type DashboardInsightRoute =
  | "/achievements"
  | "/admin-achievements"
  | "/admin-operations"
  | "/admin-tutors"
  | "/availability"
  | "/bookings"
  | "/profile";

export type DashboardInsight = {
  key: string;
  icon: ReactNode;
  label: string;
  value: ReactNode;
  detail: ReactNode;
  tone:
    | "danger-subtle"
    | "primary-subtle"
    | "success-subtle"
    | "warning-subtle"
    | "info-subtle";
  to?: DashboardInsightRoute;
  actionLabel?: string;
};

export function DashboardInsights({
  title,
  description,
  items,
}: {
  title: string;
  description: string;
  items: DashboardInsight[];
}) {
  return (
    <Card>
      <CardHeader className="py-4">
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          <Text className="mt-1 text-sm text-muted">{description}</Text>
        </div>
      </CardHeader>
      <CardBody>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
          {items.map((item) => (
            <DashboardInsightCard key={item.key} item={item} />
          ))}
        </div>
      </CardBody>
    </Card>
  );
}

function DashboardInsightCard({ item }: { item: DashboardInsight }) {
  return (
    <div className="min-w-0 rounded-xl border border-item-border bg-item p-4">
      <div className="flex items-start justify-between gap-3">
        <IconBox variant={item.tone} size="sm">
          {item.icon}
        </IconBox>
        {item.to ? (
          <Button
            variant="plain"
            size="icon"
            nativeButton={false}
            render={
              <Link
                to={item.to}
                aria-label={item.actionLabel ?? `Open ${item.label}`}
              />
            }
          >
            <IconArrowRight />
          </Button>
        ) : null}
      </div>
      <Text className="mt-4 text-sm text-muted">{item.label}</Text>
      <Heading size="sm" className="mt-1 text-2xl tabular-nums">
        {item.value}
      </Heading>
      <Text className="mt-1 text-xs text-dimmed">{item.detail}</Text>
    </div>
  );
}
