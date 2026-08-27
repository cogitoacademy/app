"use client";

import { cn } from "@cogito-app/ui/lib/utils";

const MARK_ICON_SIZES = {
  "3": "size-3",
  "4": "size-4",
  "5": "size-5",
  "6": "size-6",
} as const;

export type CogitoMarksProps = {
  value: number | string;
  size?: keyof typeof MARK_ICON_SIZES;
  className?: string;
};

export function CogitoMarks({
  value,
  size = "4",
  className,
}: CogitoMarksProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap",
        className,
      )}
      aria-label={`${value} Marks`}
    >
      <img
        src="/cogito-mark.png"
        alt=""
        aria-hidden="true"
        className={cn(MARK_ICON_SIZES[size], "shrink-0 object-contain")}
      />
      <span>{value}</span>
    </span>
  );
}
