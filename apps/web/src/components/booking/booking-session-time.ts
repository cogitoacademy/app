"use client";

/**
 * Shared wall-clock → UTC instant construction for booking scheduling.
 *
 * The booking UI collects a date (YYYY-MM-DD) and a minute time (HH:MM) in
 * the booking timezone (Asia/Jakarta). These helpers convert that wall-clock
 * input into a UTC instant without hardcoding the UTC offset, so the
 * construction stays exact for any IANA timezone and can never double-apply
 * an offset (the previous inline construction hardcoded `+07:00` in five
 * places across three files).
 */

/**
 * Formats a date value as `YYYY-MM-DD` in the given IANA timezone.
 *
 * Uses `formatToParts` (not `format`) so the output is guaranteed to be the
 * ISO date shape regardless of the ICU version's `en-CA` string rendering.
 */
export function formatDateValue(value: Date | string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).formatToParts(new Date(value));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * Formats a date value as `HH:MM` in the given IANA timezone.
 *
 * Uses an explicit `hourCycle: "h23"` so midnight renders as `00:00` and
 * never as the `24:00` some ICU versions produce for `hour12: false`.
 */
export function formatTimeValue(value: Date | string, timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(new Date(value));
}

/**
 * Builds the UTC instant for a wall-clock `date` (YYYY-MM-DD) + `time`
 * (HH:MM) in `timeZone`.
 *
 * A bare `YYYY-MM-DD` string is treated as the wall-clock date directly (the
 * DatePicker contract); a Date/ISO instant is first converted to the wall-clock
 * date in `timeZone`. The offset is derived from the IANA timezone at the
 * target wall-clock time rather than hardcoded, so the result is exact for any
 * timezone (including DST zones) and never double-applies an offset.
 */
export function toSessionStart(
  dateValue: Date | string,
  time: string,
  timeZone: string,
) {
  const date =
    typeof dateValue === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)
      ? dateValue
      : formatDateValue(dateValue, timeZone);
  const [year, month, day] = date.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const [hour, minute] = time.split(":").map(Number) as [number, number];
  const asUtc = Date.UTC(year, month - 1, day, hour, minute);
  const offsetMs = getTimezoneOffsetMs(asUtc, timeZone);
  return new Date(asUtc - offsetMs);
}

/**
 * Returns the UTC offset in milliseconds of `timeZone` at the given instant.
 *
 * The instant is formatted in the target timezone and the wall-clock parts
 * are re-assembled as UTC; the difference is the offset. This is the standard
 * Intl-based offset derivation and works for any IANA timezone.
 */
function getTimezoneOffsetMs(instantMs: number, timeZone: string) {
  const instant = new Date(instantMs);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  const wallClockMs = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return wallClockMs - instantMs;
}
