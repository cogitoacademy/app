"use client";

import { IconInfoSquareRounded } from "@tabler/icons-react";
import {
  Popover,
  PopoverDescription,
  PopoverPopup,
  PopoverTitle,
  PopoverTrigger,
} from "@cogito-app/ui/components/selia/popover";
import { cn } from "@cogito-app/ui/lib/utils";

type InfoPreviewTone = "info" | "success" | "warning";

const defaultInfoPreviewIcon = <IconInfoSquareRounded />;

export function InfoPreview({
  icon = defaultInfoPreviewIcon,
  title,
  description,
  label,
  tone = "info",
  children,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description: React.ReactNode;
  label?: string;
  tone?: InfoPreviewTone;
  children?: React.ReactNode;
  className?: string;
}) {
  const triggerLabel = label ?? `More information about ${title}`;
  const triggerClassName = cn(
    "inline-flex size-5 shrink-0 items-center justify-center rounded-sm border-0 bg-transparent p-0",
    "transition-colors focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2",
    tone === "warning"
      ? "text-warning hover:text-warning/80 focus-visible:outline-warning"
      : tone === "success"
        ? "text-success hover:text-success/80 focus-visible:outline-success"
        : "text-info hover:text-info/80 focus-visible:outline-info",
    className,
  );

  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={180}
        closeDelay={120}
        aria-label={triggerLabel}
        render={<button type="button" aria-label={triggerLabel} />}
        className={triggerClassName}
      >
        <span
          aria-hidden="true"
          className="flex items-center [&_svg:not([class*=size-])]:size-4"
        >
          {icon}
        </span>
      </PopoverTrigger>
      <PopoverPopup sideOffset={8} className="space-y-2">
        <PopoverTitle>{title}</PopoverTitle>
        <PopoverDescription>{description}</PopoverDescription>
        {children ? <div className="pt-1">{children}</div> : null}
      </PopoverPopup>
    </Popover>
  );
}
