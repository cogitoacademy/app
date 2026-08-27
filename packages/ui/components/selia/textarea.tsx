"use client";

import * as React from "react";
import { cn } from "@cogito-app/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

export const textareaVariants = cva(
  [
    "min-h-28 w-full resize-y px-3.5 py-2.5 text-[16px] lg:text-base text-foreground rounded placeholder:text-dimmed transition-[color,box-shadow] shadow-input",
    "ring ring-input-border hover:not-[[data-disabled]]:not-[:focus]:ring-input-accent-border focus:outline-0 focus:ring-primary focus:ring-2",
    "disabled:opacity-70 disabled:cursor-not-allowed data-disabled:opacity-70 data-disabled:cursor-not-allowed",
  ],
  {
    variants: {
      variant: {
        default: "bg-input",
        subtle: "bg-input/60",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export function Textarea({
  className,
  variant,
  ...props
}: React.ComponentProps<"textarea"> & VariantProps<typeof textareaVariants>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(textareaVariants({ variant, className }))}
      {...props}
    />
  );
}
