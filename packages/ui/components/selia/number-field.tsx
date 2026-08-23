"use client";

import * as React from "react";
import { NumberField as BaseNumberField } from "@base-ui/react/number-field";
import { cn } from "@cogito-app/ui/lib/utils";
import { inputVariants } from "./input";
import { type VariantProps } from "class-variance-authority";

type NumberFieldInputProps = React.ComponentProps<typeof BaseNumberField.Input>;

export function NumberField({
  className,
  inputClassName,
  inputProps,
  variant,
  ...props
}: Omit<React.ComponentProps<typeof BaseNumberField.Root>, "children"> &
  VariantProps<typeof inputVariants> & {
    inputClassName?: string;
    inputProps?: NumberFieldInputProps;
  }) {
  return (
    <BaseNumberField.Root
      data-slot="number-field"
      className={cn("w-full", className)}
      {...props}
    >
      <BaseNumberField.Input
        data-slot="number-field-input"
        {...inputProps}
        className={cn(
          inputVariants({ variant }),
          inputProps?.className,
          inputClassName,
        )}
      />
    </BaseNumberField.Root>
  );
}
