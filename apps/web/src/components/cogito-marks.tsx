"use client";

import { Spinner } from "@cogito-app/ui/components/selia/spinner";

import { cn } from "@cogito-app/ui/lib/utils";

const MARK_ICON_SIZES = {
  "3": "size-3",
  "4": "size-4",
  "5": "size-5",
  "6": "size-6",
} as const;

const MARK_ICON_DIMENSIONS = {
  "3": 12,
  "4": 16,
  "5": 20,
  "6": 24,
} as const;

export type CogitoMarksProps = {
  value: number | string;
  loading?: boolean;
  size?: keyof typeof MARK_ICON_SIZES;
  className?: string;
};

export function CogitoMarks({
  value,
  loading = false,
  size = "4",
  className,
}: CogitoMarksProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap align-middle leading-none",
        className,
      )}
      aria-label={loading ? "Loading Marks" : `${value} Marks`}
      aria-busy={loading}
    >
      <img
        src="/cogito-mark.png"
        alt=""
        aria-hidden="true"
        width={MARK_ICON_DIMENSIONS[size]}
        height={MARK_ICON_DIMENSIONS[size]}
        className={cn(MARK_ICON_SIZES[size], "shrink-0 object-contain")}
      />
      {loading ? (
        <Spinner aria-hidden="true" className={MARK_ICON_SIZES[size]} />
      ) : (
        <span>{value}</span>
      )}
    </span>
  );
}
