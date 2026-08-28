"use client";

import type { ReactNode } from "react";
import { Card, CardBody } from "@cogito-app/ui/components/selia/card";
import { Heading } from "@cogito-app/ui/components/selia/heading";
import { IconBox } from "@cogito-app/ui/components/selia/icon-box";
import { Text } from "@cogito-app/ui/components/selia/text";
import { cn } from "@cogito-app/ui/lib/utils";

type EmptyStateTone =
  | "primary"
  | "secondary"
  | "info"
  | "success"
  | "warning"
  | "danger";

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
      | "warning-subtle"
      | "danger-subtle";
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
  danger: {
    glow: "bg-danger/15",
    wash: "from-danger/8",
    icon: "danger-subtle",
  },
};

const SIZE_STYLES = {
  inline: {
    root: "min-h-0 py-5",
    icon: "md",
    iconClass: "mb-3",
    titleClass: "text-base",
    descriptionClass: "mt-1 max-w-sm text-sm",
    actionClass: "mt-3",
  },
  compact: {
    root: "min-h-48 py-8",
    icon: "lg",
    iconClass: "mb-4",
    titleClass: undefined,
    descriptionClass: "mt-2 max-w-md",
    actionClass: "mt-5",
  },
  default: {
    root: "min-h-64 py-12",
    icon: "lg",
    iconClass: "mb-4",
    titleClass: undefined,
    descriptionClass: "mt-2 max-w-md",
    actionClass: "mt-5",
  },
} as const;

type EmptyStateProps = {
  icon: ReactNode;
  title: string;
  description: ReactNode;
  action?: ReactNode;
  tone?: EmptyStateTone;
  size?: keyof typeof SIZE_STYLES;
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
  const sizeStyles = SIZE_STYLES[size];

  return (
    <div
      data-slot="empty-state"
      className={cn(
        "relative isolate flex overflow-hidden bg-linear-to-b via-transparent to-transparent",
        "flex-col items-center justify-center px-6 text-center",
        styles.wash,
        sizeStyles.root,
        className,
      )}
    >
      <div
        aria-hidden="true"
        className={cn(
          "absolute inset-x-12 top-0 -z-1 h-28 rounded-full blur-3xl",
          size === "inline" && "inset-x-6 h-20",
          styles.glow,
        )}
      />
      <IconBox
        variant={styles.icon}
        size={sizeStyles.icon}
        className={sizeStyles.iconClass}
      >
        {icon}
      </IconBox>
      <Heading size="sm" className={sizeStyles.titleClass}>
        {title}
      </Heading>
      <Text className={cn(sizeStyles.descriptionClass, "text-muted")}>
        {description}
      </Text>
      {action ? <div className={sizeStyles.actionClass}>{action}</div> : null}
    </div>
  );
}

export function EmptyStateCard({ className, ...props }: EmptyStateProps) {
  return (
    <Card
      className={cn("w-full min-w-0 max-w-full overflow-hidden", className)}
    >
      <CardBody className="p-0!">
        <EmptyState {...props} className={cn("rounded-[inherit]", className)} />
      </CardBody>
    </Card>
  );
}
