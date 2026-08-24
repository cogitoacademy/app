"use client";

import { useMemo, useState } from "react";
import { IconClock } from "@tabler/icons-react";
import { Input } from "@cogito-app/ui/components/selia/input";
import { DatePicker } from "@cogito-app/ui/components/selia/date-picker";

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function MinuteTimeInput({
  value,
  onChange,
  id,
  ariaLabel,
  disabled,
  minTime,
  maxTime,
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  ariaLabel?: string;
  disabled?: boolean;
  minTime?: string;
  maxTime?: string;
}) {
  const [focused, setFocused] = useState(false);
  const suggestions = useMemo(() => {
    const rawQuery = value.replace(":", "");
    const query = rawQuery.length === 1 ? `0${rawQuery}` : rawQuery;
    return Array.from({ length: 96 }, (_, index) => {
      const total = index * 15;
      return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
    })
      .filter((time) => isTimeWithinRange(time, minTime, maxTime))
      .filter((time) => !query || time.replace(":", "").startsWith(query))
      .slice(0, 8);
  }, [maxTime, minTime, value]);
  const invalid =
    value.length > 0 &&
    (!isValidMinuteTime(value) || !isTimeWithinRange(value, minTime, maxTime));

  return (
    <div data-slot="minute-time-input" className="relative">
      <IconClock className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted" />
      <Input
        id={id}
        aria-label={ariaLabel}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="HH:MM"
        value={value}
        disabled={disabled}
        aria-invalid={invalid}
        aria-autocomplete="list"
        aria-controls={id ? `${id}-suggestions` : undefined}
        className="pl-9 font-mono"
        maxLength={5}
        onChange={(event) => {
          let next = event.target.value.replace(/[^\d:]/g, "").slice(0, 5);
          if (/^\d{2}$/.test(next) && !value.endsWith(":")) next += ":";
          onChange(next);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          window.setTimeout(() => setFocused(false), 100);
          const normalized = normalizeTime(value);
          if (normalized) onChange(normalized);
        }}
      />
      {focused && suggestions.length > 0 ? (
        <div
          id={id ? `${id}-suggestions` : undefined}
          role="listbox"
          className="absolute z-50 mt-1 grid max-h-52 w-max min-w-full max-w-none grid-cols-2 overflow-auto rounded border border-popover-border bg-popover p-1 shadow-popover"
        >
          {suggestions.map((time) => (
            <button
              key={time}
              type="button"
              role="option"
              aria-selected={time === value}
              className="rounded-sm px-3 py-2 text-left font-mono text-sm text-popover-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary aria-selected:bg-accent"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onChange(time);
                setFocused(false);
              }}
            >
              {time}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function normalizeTime(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 1 || digits.length === 2) {
    const hour = Number(digits);
    return hour <= 23 ? `${String(hour).padStart(2, "0")}:00` : null;
  }
  if (digits.length === 3 || digits.length === 4) {
    const hour = Number(digits.slice(0, -2));
    const minute = Number(digits.slice(-2));
    if (hour <= 23 && minute <= 59) {
      return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    }
  }
  return isValidMinuteTime(value) ? value : null;
}

function timeToMinutes(value: string) {
  if (!isValidMinuteTime(value)) return null;
  const [hour, minute] = value.split(":").map(Number) as [number, number];
  return hour * 60 + minute;
}

export function isTimeWithinRange(
  value: string,
  minTime?: string,
  maxTime?: string,
) {
  const current = timeToMinutes(value);
  if (current === null) return false;
  const minimum = minTime ? timeToMinutes(minTime) : null;
  const maximum = maxTime ? timeToMinutes(maxTime) : null;
  return (
    (minimum === null || current >= minimum) &&
    (maximum === null || current <= maximum)
  );
}

export function isValidMinuteTime(value: string) {
  return TIME_PATTERN.test(value);
}

export function addMinutesToTime(value: string, minutes: number) {
  if (!isValidMinuteTime(value)) return "—";
  const [hour, minute] = value.split(":").map(Number) as [number, number];
  const total = hour * 60 + minute + minutes;
  const normalized = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

export function CrossBrowserDateTimeInput({
  id,
  value,
  onChange,
  min,
  timeAriaLabel,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  timeAriaLabel?: string;
}) {
  const [date = "", time = ""] = value.split("T");
  return (
    <div
      data-slot="cross-browser-date-time-input"
      className="grid gap-2 sm:grid-cols-[1fr_9rem]"
    >
      <DatePicker
        id={`${id}-date`}
        value={date}
        minDate={min?.split("T")[0]}
        placeholder="Pick a date"
        onChange={(nextDate) => onChange(`${nextDate}T${time}`)}
      />
      <MinuteTimeInput
        id={`${id}-time`}
        ariaLabel={timeAriaLabel}
        value={time}
        onChange={(nextTime) => onChange(`${date}T${nextTime}`)}
      />
    </div>
  );
}
