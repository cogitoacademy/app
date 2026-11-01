"use client";

import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { IconArrowUpRight } from "@tabler/icons-react";

import { Button } from "@cogito-app/ui/components/selia/button";
import { Heading } from "@cogito-app/ui/components/selia/heading";
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
    <section aria-label={title} className="space-y-4">
      <div>
        <Heading size="sm">{title}</Heading>
        <Text className="mt-1 text-sm text-muted">{description}</Text>
      </div>
      <div className="flex flex-col overflow-hidden rounded-xl border border-border sm:flex-row sm:divide-x sm:divide-border">
        {items.map((item) => (
          <DashboardInsightMetric key={item.key} item={item} />
        ))}
      </div>
    </section>
  );
}

function DashboardInsightMetric({ item }: { item: DashboardInsight }) {
  return (
    <div className="relative flex min-w-0 flex-1 flex-col border-b border-border p-4 last:border-b-0 sm:border-b-0">
      <Text className="pr-9 text-sm text-muted">{item.label}</Text>
      <Heading size="sm" className="mt-1 text-3xl font-medium tabular-nums">
        {item.value}
      </Heading>
      <Text className="mt-2 text-xs text-dimmed">{item.detail}</Text>
      {item.to ? (
        <Button
          className="absolute right-2 top-2"
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
          <IconArrowUpRight aria-hidden />
        </Button>
      ) : null}
    </div>
  );
}
