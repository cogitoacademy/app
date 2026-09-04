"use client";

import * as React from "react";
import { cn } from "@cogito-app/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { useRender } from "@base-ui/react/use-render";

export const headingVariants = cva("font-semibold text-foreground", {
  variants: {
    size: {
      sm: "text-lg",
      md: "text-2xl",
      lg: "text-3xl",
    },
  },
  defaultVariants: {
    size: "lg",
  },
});

export function Heading({
  level,
  size,
  className,
  render,
  ...props
}: useRender.ComponentProps<"h1"> &
  VariantProps<typeof headingVariants> & {
    level?: 1 | 2 | 3 | 4 | 5 | 6;
  }) {
  const levelMap = {
    lg: 1,
    md: 2,
    sm: 3,
  };

  const selectedLevel = level ?? levelMap[size || "lg"] ?? 1;

  return useRender({
    defaultTagName: `h${selectedLevel}` as keyof React.JSX.IntrinsicElements,
    render,
    props: {
      "data-slot": "heading",
      className: cn(headingVariants({ size, className })),
      ...props,
    },
  });
}
