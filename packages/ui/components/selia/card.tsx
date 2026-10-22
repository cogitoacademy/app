"use client";

import * as React from "react";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@cogito-app/ui/lib/utils";

export function Card({
  className,
  render,
  ...props
}: useRender.ComponentProps<"div">) {
  return useRender({
    defaultTagName: "div",
    render,
    props: {
      "data-slot": "card",
      className: cn(
        "@container/card min-w-0 text-foreground ring ring-card-border rounded-xl shadow-card bg-card",
        className,
      ),
      ...props,
    },
  });
}

export const cardHeaderVariants = cva(
  [
    "p-6 gap-x-3.5 gap-y-2 border-b border-card-separator",
    "min-w-0 grid grid-cols-[minmax(0,1fr)_auto]",
    "has-[>svg]:grid-cols-[auto_minmax(0,1fr)_auto]",
    "has-[[data-slot=iconbox]]:grid-cols-[auto_minmax(0,1fr)_auto]",
    "@sm/card:has-[>svg]:*:data-[slot=card-header-action]:col-start-3",
    "@sm/card:has-[[data-slot=iconbox]]:*:data-[slot=card-header-action]:col-start-3",
    "has-[[data-slot=iconbox]]:*:data-[slot=card-description]:col-start-2",
    "[&>svg]:row-span-2",
    "*:data-[slot=iconbox]:row-span-2",
    "*:data-[slot=card-description]:row-start-2",
    "not-[:has([data-slot=iconbox])]:items-center",
    "*:[[data-slot=card-title]:not(:has(+[data-slot=card-description]))]:row-span-2",
  ],
  {
    variants: {
      align: {
        default: "justify-start",
        center: "justify-center text-center",
        right: "justify-end",
      },
    },
    defaultVariants: {
      align: "default",
    },
  },
);

export function CardHeader({
  align,
  className,
  ...props
}: React.ComponentProps<"header"> & VariantProps<typeof cardHeaderVariants>) {
  return (
    <header
      data-slot="card-header"
      className={cn(cardHeaderVariants({ align, className }))}
      {...props}
    />
  );
}

export function CardHeaderAction({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header-action"
      className={cn(
        "col-start-2 row-start-1 row-span-2 ml-auto flex flex-wrap items-center justify-end gap-2",
        "@max-sm/card:col-span-full @max-sm/card:col-start-1 @max-sm/card:row-start-3 @max-sm/card:row-span-1 @max-sm/card:ml-0 @max-sm/card:w-full @max-sm/card:justify-start",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({
  level = 3,
  className,
  ...props
}: React.ComponentProps<"h3"> & {
  level?: 1 | 2 | 3 | 4 | 5 | 6;
}) {
  return useRender({
    defaultTagName: `h${level}` as keyof React.JSX.IntrinsicElements,
    props: {
      "data-slot": "card-title",
      className: cn(
        "text-base md:text-lg font-semibold leading-none",
        "has-[>[data-slot=card-info-preview]]:flex has-[>[data-slot=card-info-preview]]:flex-wrap has-[>[data-slot=card-info-preview]]:items-center has-[>[data-slot=card-info-preview]]:gap-2",
        className,
      ),
      ...props,
    },
  });
}

export function CardInfoPreview({
  className,
  children,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="card-info-preview"
      className={cn("inline-flex shrink-0", className)}
      {...props}
    >
      {children}
    </span>
  );
}

export function CardDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="card-description"
      className={cn("text-muted", className)}
      {...props}
    />
  );
}

export function CardBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-body"
      className={cn(
        "min-w-0 p-6 **:data-[slot=item]:px-6",
        "has-[>[data-slot=table-container]:only-child]:py-0",
        "*:data-[slot=table-container]:-mx-6 *:data-[slot=table-container]:w-[calc(100%+3rem)]",
        "*:data-[slot=table-container]:my-6 *:data-[slot=table-container]:first:mt-0 *:data-[slot=table-container]:last:mb-0",
        className,
      )}
      {...props}
    />
  );
}

export function CardFooter({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center gap-1.5",
        "p-6 bg-card-footer border-t border-card-separator rounded-b-xl",
        className,
      )}
      {...props}
    />
  );
}
