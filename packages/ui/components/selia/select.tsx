"use client";

import * as React from "react";
import { Select as BaseSelect } from "@base-ui/react/select";
import { cn } from "@cogito-app/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { Chip } from "./chip";

export type SelectItem = {
  value: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
};

type SelectItemElementProps = {
  value?: unknown;
  children?: React.ReactNode;
};

function toSelectItemValue(value: unknown, label: React.ReactNode) {
  return typeof value === "object" ? value : { value, label };
}

function collectSelectItemValues(children: React.ReactNode): unknown[] {
  const values: unknown[] = [];

  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;

    if (child.type === SelectItem) {
      const props = child.props as SelectItemElementProps;
      values.push(toSelectItemValue(props.value, props.children));
      return;
    }

    const nestedChildren = (child.props as SelectItemElementProps).children;
    if (nestedChildren) {
      values.push(...collectSelectItemValues(nestedChildren));
    }
  });

  return values;
}

function collectRootItemValues(items: unknown): unknown[] {
  if (Array.isArray(items)) {
    const values: unknown[] = [];

    for (const item of items) {
      if (
        item !== null &&
        typeof item === "object" &&
        "items" in item &&
        Array.isArray(item.items)
      ) {
        values.push(...collectRootItemValues(item.items));
      } else if (item !== null && typeof item === "object" && "value" in item) {
        values.push(item);
      }
    }

    return values;
  }

  if (items !== null && typeof items === "object") {
    return Object.entries(items).map(([value, label]) => ({ value, label }));
  }

  return [];
}

function normalizeSingleSelectValue(
  value: unknown,
  itemValues: readonly unknown[],
) {
  if (value === null || value === undefined) return value;

  const itemValue = getSelectItemValue(value);
  if (itemValue === "") return null;
  if (itemValue === null) return value;

  return (
    itemValues.find(
      (candidate) => getSelectItemValue(candidate) === itemValue,
    ) ?? value
  );
}

function normalizeSelectValue(
  value: unknown,
  itemValues: readonly unknown[],
  multiple: boolean,
) {
  if (multiple && Array.isArray(value)) {
    return value.map((item) => normalizeSingleSelectValue(item, itemValues));
  }

  return normalizeSingleSelectValue(value, itemValues);
}

function toSelectChangeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => getSelectItemValue(item) ?? item);
  }

  return getSelectItemValue(value) ?? value;
}

function areSelectValuesEqual(itemValue: unknown, selectedValue: unknown) {
  const itemId = getSelectItemValue(itemValue);
  const selectedId = getSelectItemValue(selectedValue);

  if (itemId !== null && selectedId !== null) {
    return itemId === selectedId;
  }

  return Object.is(itemValue, selectedValue);
}

export function getSelectItemValue(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (
    value !== null &&
    typeof value === "object" &&
    "value" in value &&
    typeof value.value === "string"
  ) {
    return value.value;
  }

  return null;
}

export function Select({
  children,
  value,
  defaultValue,
  onValueChange,
  items,
  multiple,
  isItemEqualToValue,
  ...props
}: React.ComponentProps<typeof BaseSelect.Root>) {
  const itemValues = React.useMemo(() => {
    const values = collectSelectItemValues(children);
    return values.length > 0 ? values : collectRootItemValues(items);
  }, [children, items]);
  const normalizedValue = normalizeSelectValue(
    value,
    itemValues,
    multiple === true,
  );
  const normalizedDefaultValue = normalizeSelectValue(
    defaultValue,
    itemValues,
    multiple === true,
  );

  return (
    <BaseSelect.Root
      {...props}
      items={items}
      multiple={multiple}
      isItemEqualToValue={isItemEqualToValue ?? areSelectValuesEqual}
      value={normalizedValue}
      defaultValue={normalizedDefaultValue}
      onValueChange={(nextValue, details) =>
        onValueChange?.(toSelectChangeValue(nextValue), details)
      }
    >
      {children}
    </BaseSelect.Root>
  );
}

export const selectTriggerVariants = cva(
  [
    "h-9.5 px-3.5 w-full bg-input rounded placeholder:text-dimmed transition-[color,box-shadow]",
    "focus:outline-0 focus:ring-primary focus:ring-2",
    "flex items-center gap-2.5 cursor-pointer",
    "data-disabled:cursor-not-allowed data-disabled:opacity-70",
  ],
  {
    variants: {
      variant: {
        default:
          "bg-input ring ring-input-border hover:not-[[data-disabled]]:not-[:focus]:ring-input-accent-border shadow-input",
        subtle:
          "bg-input/60 ring ring-input-border hover:not-[[data-disabled]]:not-[:focus]:ring-input-accent-border shadow-input",
        plain: "bg-transparent hover:not-[[data-disabled]]:bg-accent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export function SelectTrigger({
  className,
  children,
  variant,
  ...props
}: React.ComponentProps<typeof BaseSelect.Trigger> &
  VariantProps<typeof selectTriggerVariants>) {
  return (
    <BaseSelect.Trigger
      data-slot="select-trigger"
      className={cn(selectTriggerVariants({ variant, className }))}
      {...props}
    >
      {children}

      <BaseSelect.Icon className="ml-auto size-4 text-muted pointer-events-none">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </BaseSelect.Icon>
    </BaseSelect.Trigger>
  );
}

export function SelectValue({
  className,
  placeholder = "Select an option",
  ...props
}: React.ComponentProps<typeof BaseSelect.Value> & {
  placeholder?: string;
}) {
  return (
    <BaseSelect.Value
      data-slot="select-value"
      className={cn(className)}
      {...props}
    >
      {(value: string | SelectItem | null) => (
        <SelectRenderValue value={value} placeholder={placeholder} />
      )}
    </BaseSelect.Value>
  );
}

function SelectRenderValue({
  value,
  placeholder,
}: {
  value: string | SelectItem | SelectItem[] | null;
  placeholder: string;
}) {
  if (!value || (Array.isArray(value) && value.length === 0)) {
    return <span className="text-dimmed">{placeholder}</span>;
  }

  if (Array.isArray(value)) {
    const firstValue = value[0];
    const firstValueLabel =
      typeof firstValue === "object" ? firstValue.label : firstValue;
    const additionalValues =
      value.length > 1 ? (
        <Chip className="ml-1.5" size="sm">
          +{value.length - 1} more
        </Chip>
      ) : (
        ""
      );

    return (
      <>
        {firstValueLabel}
        {additionalValues}
      </>
    );
  }

  if (typeof value === "object") {
    return (
      <div className="flex items-center gap-2.5 select-none [&_svg:not([class*=size-])]:size-4 [&_svg:not([class*=text-])]:text-popover-foreground">
        {value.icon}
        <span className="text-popover-foreground">{value.label}</span>
      </div>
    );
  }

  return <span className="text-popover-foreground select-none">{value}</span>;
}

export function SelectPopup({
  children,
  className,
  align,
  alignOffset,
  side,
  sideOffset,
  anchor,
  sticky,
  positionMethod,
  ...props
}: React.ComponentProps<typeof BaseSelect.Popup> &
  VariantProps<typeof selectTriggerVariants> & {
    align?: BaseSelect.Positioner.Props["align"];
    alignOffset?: BaseSelect.Positioner.Props["alignOffset"];
    side?: BaseSelect.Positioner.Props["side"];
    sideOffset?: BaseSelect.Positioner.Props["sideOffset"];
    anchor?: BaseSelect.Positioner.Props["anchor"];
    sticky?: BaseSelect.Positioner.Props["sticky"];
    positionMethod?: BaseSelect.Positioner.Props["positionMethod"];
  }) {
  return (
    <BaseSelect.Portal>
      <BaseSelect.Backdrop />
      <BaseSelect.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset || 6}
        anchor={anchor}
        sticky={sticky}
        positionMethod={positionMethod}
      >
        <BaseSelect.ScrollUpArrow className="top-1 left-1 right-1 z-10 absolute rounded h-5 text-xs text-popover-foreground flex items-center justify-around bg-popover-accent" />
        <BaseSelect.Popup
          data-slot="select-popup"
          {...props}
          className={cn(
            "group origin-(--transform-origin) bg-popover ring ring-popover-border rounded shadow-popover",
            "p-1 outline-none max-lg:w-(--anchor-width)",
            className,
          )}
        >
          <BaseSelect.Arrow />
          {children}
        </BaseSelect.Popup>
        <BaseSelect.ScrollDownArrow className="bottom-1 left-1 right-1 z-10 absolute rounded h-5 text-xs text-popover-foreground flex items-center justify-around bg-popover-accent" />
      </BaseSelect.Positioner>
    </BaseSelect.Portal>
  );
}

export function SelectList({
  className,
  ...props
}: React.ComponentProps<typeof BaseSelect.List>) {
  return (
    <BaseSelect.List
      data-slot="select-list"
      className={cn(
        "space-y-0.5 max-h-(--available-height) overflow-y-auto relative",
        className,
      )}
      {...props}
    />
  );
}

export function SelectItem({
  className,
  children,
  value,
  ...props
}: React.ComponentProps<typeof BaseSelect.Item>) {
  return (
    <BaseSelect.Item
      data-slot="select-item"
      value={toSelectItemValue(value, children)}
      className={cn(
        "flex items-center text-popover-foreground py-2.5 px-3 gap-3.5 rounded select-none cursor-pointer",
        "group-data-[side=none]:min-w-[calc(var(--anchor-width))]",
        "data-[highlighted]:not-[[data-disabled]]:bg-popover-accent data-[selected]:not-[[data-disabled]]:bg-popover-accent",
        "focus-visible:outline-none",
        "data-disabled:cursor-not-allowed data-disabled:opacity-70",
        className,
      )}
      {...props}
    >
      <BaseSelect.ItemText className="flex items-center gap-2.5 [&_svg:not([class*=size-])]:size-4">
        {children}
      </BaseSelect.ItemText>
      <BaseSelect.ItemIndicator className="ml-auto">
        <svg
          className="size-4 text-primary"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </BaseSelect.ItemIndicator>
    </BaseSelect.Item>
  );
}

export function SelectGroup({
  className,
  ...props
}: React.ComponentProps<typeof BaseSelect.Group>) {
  return (
    <BaseSelect.Group
      data-slot="select-group"
      className={cn("space-y-0.5", className)}
      {...props}
    />
  );
}

export function SelectGroupLabel({
  className,
  ...props
}: React.ComponentProps<typeof BaseSelect.GroupLabel>) {
  return (
    <BaseSelect.GroupLabel
      data-slot="select-group-label"
      className={cn("px-3 py-1.5 text-sm font-medium text-dimmed", className)}
      {...props}
    />
  );
}

export function SelectSeparator({
  className,
  ...props
}: React.ComponentProps<typeof BaseSelect.Separator>) {
  return (
    <BaseSelect.Separator
      data-slot="select-separator"
      className={cn("h-px my-1 bg-popover-separator", className)}
      {...props}
    />
  );
}
