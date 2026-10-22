"use client";

import { cn } from "@cogito-app/ui/lib/utils";

export function Table({ ...props }: React.ComponentProps<"table">) {
  return (
    <table
      data-slot="table"
      {...props}
      className={cn("w-full text-table-foreground text-left", props.className)}
    />
  );
}

export function TableContainer({ ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="table-container"
      {...props}
      className={cn(
        "min-w-0 overflow-x-auto w-full overscroll-x-contain",
        props.className,
      )}
    />
  );
}

export function TableHeader({ ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      {...props}
      className={cn(props.className)}
    />
  );
}

export function TableHead({ ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      {...props}
      className={cn(
        "px-3 py-2 text-muted font-medium bg-table-head border-y border-table-separator sm:px-6",
        props.className,
      )}
    />
  );
}

export function TableBody({ ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody data-slot="table-body" {...props} className={cn(props.className)} />
  );
}

export function TableRow({ ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      {...props}
      className={cn(
        "border-b border-table-separator last:border-none hover:bg-table-accent",
        props.className,
      )}
    />
  );
}

export function TableCell({ ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      {...props}
      className={cn(
        "px-3 py-4 sm:px-6",
        "has-[>a:only-child]:p-0 [&>a:only-child]:px-3 [&>a:only-child]:py-4 [&>a:only-child]:inline-flex [&>a:only-child]:w-full sm:[&>a:only-child]:px-6",
        props.className,
      )}
    />
  );
}

export function TableFooter({ ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      {...props}
      className={cn("text-xs text-muted-foreground", props.className)}
    />
  );
}

export function TableCaption({
  side,
  ...props
}: React.ComponentProps<"caption"> & {
  side?: "top" | "bottom";
}) {
  return (
    <caption
      data-slot="table-caption"
      {...props}
      className={cn(
        "text-sm text-muted my-4",
        side === "top" ? "caption-top" : "caption-bottom",
        props.className,
      )}
    />
  );
}
