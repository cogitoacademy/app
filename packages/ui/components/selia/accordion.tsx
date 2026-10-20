"use client";

import { Accordion as BaseAccordion } from "@base-ui/react/accordion";
import type { ComponentProps } from "react";
import { cn } from "@cogito-app/ui/lib/utils";

export function Accordion({
  className,
  ...props
}: ComponentProps<typeof BaseAccordion.Root>) {
  return (
    <BaseAccordion.Root
      data-slot="accordion"
      className={cn("flex flex-col", className)}
      {...props}
    />
  );
}

export function AccordionItem({
  className,
  children,
  ...props
}: ComponentProps<typeof BaseAccordion.Item>) {
  return (
    <BaseAccordion.Item
      data-slot="accordion-item"
      className={cn("border-b border-card-border last:border-b-0", className)}
      {...props}
    >
      {children}
    </BaseAccordion.Item>
  );
}

export function AccordionHeader({
  className,
  children,
  ...props
}: ComponentProps<typeof BaseAccordion.Header>) {
  return (
    <BaseAccordion.Header
      data-slot="accordion-header"
      className={className}
      {...props}
    >
      {children}
    </BaseAccordion.Header>
  );
}

export function AccordionTrigger({
  className,
  expandableIndicator = true,
  ...props
}: ComponentProps<typeof BaseAccordion.Trigger> & {
  expandableIndicator?: boolean;
}) {
  return (
    <BaseAccordion.Trigger
      data-slot="accordion-trigger"
      data-expandable={expandableIndicator ? true : undefined}
      className={cn(
        "flex cursor-pointer select-none items-center gap-2.5",
        "w-full py-4 text-left font-medium leading-relaxed",
        "transition-colors duration-100",
        "focus:outline-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        "[&>svg:not([class*=size-])]:size-4 [&>svg:not([class*=text-])]:text-current",
        "**:data-[slot=expandable-indicator]:transition-all **:data-[slot=expandable-indicator]:duration-100",
        "disabled:cursor-not-allowed disabled:opacity-70",
        expandableIndicator &&
          "data-expandable:after:bg-chevron-down-dark dark:data-expandable:after:bg-chevron-down data-expandable:after:ml-auto data-expandable:after:size-4 data-expandable:after:shrink-0 data-expandable:after:transition-transform data-expandable:after:duration-100 data-expandable:data-[panel-open]:after:rotate-180",
        className,
      )}
      {...props}
    />
  );
}

export function AccordionPanel({
  className,
  children,
  ...props
}: ComponentProps<typeof BaseAccordion.Panel>) {
  return (
    <BaseAccordion.Panel
      data-slot="accordion-panel"
      className={cn(
        "flex h-[var(--accordion-panel-height)] flex-col gap-2.5 overflow-hidden transition-all ease-out",
        "[&[hidden]:not([hidden=until-found])]:hidden data-[ending-style]:h-0 data-[starting-style]:h-0",
        className,
      )}
      {...props}
    >
      <div data-slot="accordion-panel-content" className="pb-2">
        {children}
      </div>
    </BaseAccordion.Panel>
  );
}
