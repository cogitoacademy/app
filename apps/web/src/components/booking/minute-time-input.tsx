"use client";

import { IconClock } from "@tabler/icons-react";
import { Input } from "@cogito-app/ui/components/selia/input";

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function MinuteTimeInput({
  value,
  onChange,
  id,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  id?: string;
  disabled?: boolean;
}) {
  return (
    <div data-slot="minute-time-input" className="relative">
      <IconClock className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted" />
      <Input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="HH:MM"
        value={value}
        disabled={disabled}
        aria-invalid={value.length === 5 && !TIME_PATTERN.test(value)}
        className="pl-9 font-mono"
        maxLength={5}
        onChange={(event) => {
          let next = event.target.value.replace(/[^\d:]/g, "").slice(0, 5);
          if (/^\d{2}$/.test(next) && !value.endsWith(":")) next += ":";
          onChange(next);
        }}
      />
    </div>
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
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
}) {
  const [date = "", time = ""] = value.split("T");
  return (
    <div
      data-slot="cross-browser-date-time-input"
      className="grid gap-2 sm:grid-cols-[1fr_9rem]"
    >
      <Input
        id={`${id}-date`}
        type="date"
        value={date}
        min={min?.split("T")[0]}
        onChange={(event) => onChange(`${event.target.value}T${time}`)}
      />
      <MinuteTimeInput
        id={`${id}-time`}
        value={time}
        onChange={(nextTime) => onChange(`${date}T${nextTime}`)}
      />
    </div>
  );
}
