"use client";

import type { ReactNode } from "react";
import { Card, CardBody } from "@cogito-app/ui/components/selia/card";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { IconBox } from "@cogito-app/ui/components/selia/icon-box";
import { Text } from "@cogito-app/ui/components/selia/text";
import { cn } from "@cogito-app/ui/lib/utils";

type EmptyStateTone = "primary" | "secondary" | "info" | "success" | "warning";

const TONE_STYLES: Record<
  EmptyStateTone,
  {
    glow: string;
    wash: string;
    icon:
      | "primary-subtle"
      | "secondary-subtle"
      | "info-subtle"
      | "success-subtle"
      | "warning-subtle";
  }
> = {
  primary: {
    glow: "bg-primary/15",
    wash: "from-primary/8",
    icon: "primary-subtle",
  },
  secondary: {
    glow: "bg-secondary/20",
    wash: "from-secondary/10",
    icon: "secondary-subtle",
  },
  info: {
    glow: "bg-info/15",
    wash: "from-info/8",
    icon: "info-subtle",
  },
  success: {
    glow: "bg-success/15",
    wash: "from-success/8",
    icon: "success-subtle",
  },
  warning: {
    glow: "bg-warning/15",
    wash: "from-warning/8",
    icon: "warning-subtle",
  },
};

type EmptyStateProps = {
  icon: ReactNode;
  title: string;
  description: ReactNode;
  action?: ReactNode;
  tone?: EmptyStateTone;
  size?: "compact" | "default";
  className?: string;
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  tone = "info",
  size = "default",
  className,
}: EmptyStateProps) {
  const styles = TONE_STYLES[tone];

  return (
    <div
      data-slot="empty-state"
      className={cn(
        "relative isolate flex overflow-hidden bg-linear-to-b via-transparent to-transparent",
        "flex-col items-center justify-center px-6 text-center",
        styles.wash,
        size === "compact" ? "min-h-48 py-8" : "min-h-64 py-12",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className={cn(
          "absolute inset-x-12 top-0 -z-1 h-28 rounded-full blur-3xl",
          styles.glow,
        )}
      />
      <IconBox variant={styles.icon} size="lg" className="mb-4">
        {icon}
      </IconBox>
      <Heading size="sm">{title}</Heading>
      <Text className="mt-2 max-w-md text-muted">{description}</Text>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function EmptyStateCard({ className, ...props }: EmptyStateProps) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardBody className="p-0!">
        <EmptyState {...props} />
      </CardBody>
    </Card>
  );
}
