"use client";

import * as React from "react";
import { DayPicker, type DayPickerProps } from "react-day-picker";
import { cn } from "@cogito-app/ui/lib/utils";
import {
  getSelectItemValue,
  Select,
  SelectItem,
  SelectList,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "./select";

export type CalendarProps = DayPickerProps;

function CalendarSelect(props: React.ComponentProps<"select">) {
  const {
    className,
    children,
    value,
    onChange,
    disabled,
    id,
    title,
    "aria-label": ariaLabel,
    "aria-labelledby": ariaLabelledBy,
    ...rest
  } = props;
  const selectedValue = value === undefined ? null : String(value);

  return (
    <Select
      value={selectedValue}
      disabled={disabled}
      onValueChange={(nextValue) => {
        const next = getSelectItemValue(nextValue);
        if (next === null) return;
        onChange?.({
          target: { value: next },
          currentTarget: { value: next },
        } as React.ChangeEvent<HTMLSelectElement>);
      }}
      {...rest}
    >
      <SelectTrigger
        id={id}
        title={title}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        variant="plain"
        className={cn(
          "h-8 w-auto min-w-24 rounded bg-accent px-2.5 text-sm font-medium text-foreground",
          "hover:bg-accent/80 focus-visible:outline-2 focus-visible:outline-primary",
          className,
        )}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectPopup className="min-w-32">
        <SelectList>{children}</SelectList>
      </SelectPopup>
    </Select>
  );
}

function CalendarOption({
  value,
  disabled,
  children,
}: React.ComponentProps<"option">) {
  return (
    <SelectItem value={String(value ?? "")} disabled={disabled}>
      {children}
    </SelectItem>
  );
}

export function Calendar({
  className,
  classNames,
  components,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      captionLayout="dropdown"
      navLayout="around"
      className={cn("rdp-root p-3", className)}
      classNames={{
        root: "rdp-root",
        months: "flex flex-col sm:flex-row gap-4",
        month: "grid grid-cols-[auto_1fr_auto] gap-y-3 gap-x-1 items-center",
        month_caption: "col-start-2 flex justify-center items-center",
        caption_label: "hidden",
        dropdown_root: "inline-flex",
        dropdowns: "flex items-center gap-1.5",
        button_previous:
          "col-start-1 size-7 grid place-items-center rounded hover:bg-accent transition-colors",
        button_next:
          "col-start-3 size-7 grid place-items-center rounded hover:bg-accent transition-colors",
        chevron: "size-4 text-foreground",
        month_grid: "col-span-3 w-full border-collapse",
        weekdays: "flex",
        weekday:
          "size-8 flex-1 text-xs text-muted flex items-center justify-center font-normal",
        weeks: "flex flex-col gap-1 mt-2",
        week: "flex w-full gap-1",
        day: "size-8 flex-1 text-center text-sm text-foreground p-0",
        day_button:
          "size-8 w-full rounded grid place-items-center cursor-pointer transition-[background-color,color,box-shadow,transform] hover:bg-accent active:scale-95",
        selected:
          "[&>button]:rounded [&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary!",
        today: "[&>button]:rounded [&>button]:ring-1 [&>button]:ring-primary",
        outside: "text-muted opacity-50",
        disabled: "opacity-30 cursor-not-allowed",
        ...classNames,
      }}
      components={{
        Select: CalendarSelect,
        Option: CalendarOption,
        ...components,
      }}
      {...props}
    />
  );
}
