"use client";

import type { ComponentProps } from "react";
import { Radio as BaseRadio } from "@base-ui/react/radio";
import { RadioGroup as BaseRadioGroup } from "@base-ui/react/radio-group";
import { cn } from "@cogito-app/ui/lib/utils";

export function RadioGroup({
  className,
  ...props
}: ComponentProps<typeof BaseRadioGroup>) {
  return (
    <BaseRadioGroup
      data-slot="radio-group"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  );
}

export function Radio({
  className,
  ...props
}: ComponentProps<typeof BaseRadio.Root>) {
  return (
    <BaseRadio.Root
      data-slot="radio"
      {...props}
      className={cn(
        "flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-full border border-input-border bg-input shadow-input transition-colors hover:border-input-accent-border data-checked:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className,
      )}
    >
      <BaseRadio.Indicator className="size-2 rounded-full bg-primary" />
    </BaseRadio.Root>
  );
}
