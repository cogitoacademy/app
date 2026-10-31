"use client";

import { useId, useState } from "react";
import { format, isValid, parseISO } from "date-fns";
import { Popover } from "@base-ui/react/popover";
import { IconCalendar } from "@tabler/icons-react";
import { cn } from "@cogito-app/ui/lib/utils";
import { Calendar } from "./calendar";

export type DatePickerProps = {
  id?: string;
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  minDate?: string;
  maxDate?: string;
  required?: boolean;
};

export function DatePicker({
  id,
  value,
  onChange,
  placeholder = "Pick a date",
  disabled,
  minDate,
  maxDate,
  required,
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const generatedId = useId();
  const triggerId = id ?? generatedId;

  const parsedDate = value ? parseISO(value) : undefined;
  const date = parsedDate && isValid(parsedDate) ? parsedDate : undefined;
  // DayPicker otherwise caps its year dropdown at the current year.
  const endMonth = maxDate
    ? parseISO(maxDate)
    : new Date(new Date().getFullYear() + 100, 11, 31);
  const disabledDates = [
    ...(minDate ? [{ before: parseISO(minDate) }] : []),
    ...(maxDate ? [{ after: parseISO(maxDate) }] : []),
  ];

  const handleSelect = (selectedDate: Date | undefined) => {
    if (selectedDate) {
      onChange(format(selectedDate, "yyyy-MM-dd"));
    } else {
      onChange("");
    }
    setOpen(false);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      {required ? (
        <input
          type="text"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          required
          disabled={disabled}
          value={date ? value : ""}
          onChange={() => {}}
          onInvalid={() => document.getElementById(triggerId)?.focus()}
        />
      ) : null}
      <Popover.Trigger
        id={triggerId}
        disabled={disabled}
        className={cn(
          "flex min-w-0 items-center gap-2 w-full",
          "h-9.5 px-4 rounded",
          "bg-secondary text-secondary-foreground",
          "ring ring-secondary-border",
          "text-sm font-medium",
          "hover:not-[[data-disabled]]:bg-accent",
          "focus-visible:outline-2 focus-visible:outline-offset-2 outline-primary",
          "data-[popup-open]:bg-accent",
          "disabled:opacity-70 disabled:cursor-not-allowed",
          "transition-colors",
        )}
      >
        <IconCalendar className="size-4 text-muted" />
        <span className={cn("truncate", !date && "text-muted")}>
          {date ? format(date, "PPP") : placeholder}
        </span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          align="start"
          sideOffset={4}
          collisionPadding={8}
          collisionAvoidance={{ align: "shift", side: "flip" }}
          className="z-[1000] max-w-(--available-width)"
        >
          <Popover.Popup
            className={cn(
              "z-[1000] max-w-(--available-width) bg-popover text-popover-foreground",
              "border border-popover-border rounded-xl",
              "shadow-popover outline-none",
              "data-[starting-style]:opacity-0 data-[ending-style]:opacity-0",
              "data-[starting-style]:scale-95 data-[ending-style]:scale-95",
              "transition-[opacity,scale]",
            )}
          >
            <Calendar
              mode="single"
              selected={date}
              defaultMonth={date}
              onSelect={handleSelect}
              disabled={disabledDates}
              startMonth={minDate ? parseISO(minDate) : undefined}
              endMonth={endMonth}
            />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
