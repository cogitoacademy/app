"use client";

import { DayPicker, type DayPickerProps } from "react-day-picker";
import { cn } from "@cogito-app/ui/lib/utils";
import { IconChevronDown } from "@tabler/icons-react";

export type CalendarProps = DayPickerProps;

function CalendarSelect(props: React.ComponentProps<"select">) {
  const { className, children, ...rest } = props;
  return (
    <div className="relative inline-flex">
      <select
        {...rest}
        className={cn(
          "h-8 appearance-none rounded bg-accent pl-2.5 pr-7",
          "text-sm text-foreground font-medium",
          "border border-border cursor-pointer",
          "hover:bg-accent/80",
          "focus-visible:outline-2 focus-visible:outline-primary",
          className,
        )}
      >
        {children}
      </select>
      <IconChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 size-3.5 text-muted pointer-events-none" />
    </div>
  );
}

function CalendarOption(props: React.ComponentProps<"option">) {
  return <option {...props} />;
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
          "size-8 rounded grid place-items-center cursor-pointer transition-colors hover:bg-accent w-full",
        selected: "bg-primary text-primary-foreground hover:bg-primary!",
        today: "ring-1 ring-primary",
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
