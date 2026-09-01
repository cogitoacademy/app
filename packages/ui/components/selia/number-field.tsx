"use client";

import * as React from "react";
import { NumberField as BaseNumberField } from "@base-ui/react/number-field";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@cogito-app/ui/lib/utils";
import { inputVariants } from "./input";

type NumberFieldInputProps = React.ComponentProps<typeof BaseNumberField.Input>;

export function NumberField({
  children,
  className,
  inputClassName,
  inputProps,
  variant,
  ...props
}: React.ComponentProps<typeof BaseNumberField.Root> &
  VariantProps<typeof inputVariants> & {
    inputClassName?: string;
    inputProps?: NumberFieldInputProps;
  }) {
  return (
    <BaseNumberField.Root
      data-slot="number-field"
      {...props}
      className={cn(
        "flex w-full flex-col items-start gap-2 data-disabled:cursor-not-allowed data-disabled:opacity-70",
        className,
      )}
    >
      {children ?? (
        <BaseNumberField.Input
          data-slot="number-field-input"
          {...inputProps}
          className={cn(
            inputVariants({ variant }),
            inputProps?.className,
            inputClassName,
          )}
        />
      )}
    </BaseNumberField.Root>
  );
}

export function NumberFieldScrubArea({
  className,
  children,
  ...props
}: React.ComponentProps<typeof BaseNumberField.ScrubArea>) {
  return (
    <BaseNumberField.ScrubArea
      data-slot="number-field-scrub-area"
      {...props}
      className={cn("cursor-ew-resize", className)}
    >
      {children}
      <NumberFieldScrubAreaCursor />
    </BaseNumberField.ScrubArea>
  );
}

export function NumberFieldScrubAreaCursor(
  props: React.ComponentProps<typeof BaseNumberField.ScrubAreaCursor>,
) {
  return (
    <BaseNumberField.ScrubAreaCursor
      data-slot="number-field-scrub-area-cursor"
      {...props}
    >
      <svg
        width="26"
        height="14"
        viewBox="0 0 24 14"
        fill="black"
        stroke="white"
      >
        <path d="M19.5 5.5L6.49737 5.51844V2L1 6.9999L6.5 12L6.49737 8.5L19.5 8.5V12L25 6.9999L19.5 2V5.5Z" />
      </svg>
    </BaseNumberField.ScrubAreaCursor>
  );
}

export const NumberFieldGroupVariants = cva(
  [
    "flex h-9.5 rounded",
    "hover:not-[:focus-within]:not-[[data-disabled]]:ring-input-accent-border",
    "focus-within:ring-2 focus-within:ring-primary focus-within:outline-0",
    "aria-invalid:ring-danger-border/24 aria-invalid:ring-2",
    "[&_svg:not([class*=size-])]:size-4.5",
    "*:[button]:size-9.5 *:[button]:flex *:[button]:items-center *:[button]:justify-center",
    "*:[button]:transition-all *:[button]:duration-100",
    "*:[button]:cursor-pointer *:[button]:text-foreground",
    "*:[button]:disabled:cursor-not-allowed *:[button]:disabled:opacity-70",
    "*:first:rounded-l *:last:rounded-r",
  ],
  {
    variants: {
      variant: {
        default:
          "bg-input shadow-input ring ring-input-border *:[button]:hover:not-[[disabled]]:bg-accent",
        plain: "bg-transparent hover:bg-accent",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function NumberFieldGroup({
  className,
  variant,
  ...props
}: React.ComponentProps<typeof BaseNumberField.Group> &
  VariantProps<typeof NumberFieldGroupVariants>) {
  return (
    <BaseNumberField.Group
      data-slot="number-field-group"
      {...props}
      className={cn(NumberFieldGroupVariants({ variant, className }))}
    />
  );
}

export function NumberFieldDecrement({
  className,
  ...props
}: React.ComponentProps<typeof BaseNumberField.Decrement>) {
  return (
    <BaseNumberField.Decrement
      data-slot="number-field-decrement"
      {...props}
      className={cn(className)}
    />
  );
}

export function NumberFieldIncrement({
  className,
  ...props
}: React.ComponentProps<typeof BaseNumberField.Increment>) {
  return (
    <BaseNumberField.Increment
      data-slot="number-field-increment"
      {...props}
      className={cn(className)}
    />
  );
}

export function NumberFieldInput({
  className,
  ...props
}: React.ComponentProps<typeof BaseNumberField.Input>) {
  return (
    <BaseNumberField.Input
      data-slot="number-field-input"
      {...props}
      className={cn(
        "z-10 w-28 px-2.5 text-center text-foreground outline-none transition-all placeholder:text-dimmed disabled:pointer-events-none disabled:opacity-70",
        "aria-invalid:text-danger aria-invalid:ring-danger-border/24 aria-invalid:ring-2",
        className,
      )}
    />
  );
}
