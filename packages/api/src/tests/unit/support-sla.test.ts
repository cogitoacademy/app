import { describe, test, expect } from "bun:test";
import {
  computeSlaDeadline,
  isBusinessTimeWib,
} from "../../modules/support/support.service";
import { WIB_UTC_OFFSET_HOURS } from "../../shared/constants";

const WIB_MS = WIB_UTC_OFFSET_HOURS * 60 * 60 * 1000;

/**
 * Builds a Date for a WIB wall-clock time: `dayIso` is the WIB calendar day
 * (e.g. "2026-08-17", a Monday), `timeWib` is "HH:MM" in WIB (UTC+7).
 */
function wibDate(dayIso: string, timeWib: string): Date {
  const [h, m] = timeWib.split(":").map(Number);
  const dayUtc = new Date(`${dayIso}T00:00:00Z`);
  return new Date(dayUtc.getTime() - WIB_MS + h * 3600_000 + m * 60_000);
}

describe("isBusinessTimeWib", () => {
  test("Mon–Sat 09:00–21:00 WIB is business time", () => {
    expect(isBusinessTimeWib(wibDate("2026-08-17", "09:00"))).toBe(true); // Mon
    expect(isBusinessTimeWib(wibDate("2026-08-17", "12:00"))).toBe(true);
    expect(isBusinessTimeWib(wibDate("2026-08-17", "20:59"))).toBe(true);
    expect(isBusinessTimeWib(wibDate("2026-08-15", "10:00"))).toBe(true); // Sat
  });

  test("Sunday and outside 09:00–21:00 WIB are not business time", () => {
    expect(isBusinessTimeWib(wibDate("2026-08-16", "12:00"))).toBe(false); // Sun
    expect(isBusinessTimeWib(wibDate("2026-08-17", "08:59"))).toBe(false);
    expect(isBusinessTimeWib(wibDate("2026-08-17", "21:00"))).toBe(false);
    expect(isBusinessTimeWib(wibDate("2026-08-17", "22:00"))).toBe(false);
    expect(isBusinessTimeWib(wibDate("2026-08-17", "00:00"))).toBe(false);
  });
});

describe("computeSlaDeadline (OQ-04: 30 min Mon–Sat 09:00–21:00 WIB, else 4h)", () => {
  test("ticket at 10:00 WIB Mon → SLA 10:30 WIB Mon (30 min business)", () => {
    const deadline = computeSlaDeadline(wibDate("2026-08-17", "10:00"));
    expect(deadline.getTime()).toBe(wibDate("2026-08-17", "10:30").getTime());
  });

  test("ticket at 22:00 WIB → SLA 02:00 WIB next day (4h off-hours)", () => {
    const deadline = computeSlaDeadline(wibDate("2026-08-17", "22:00"));
    expect(deadline.getTime()).toBe(wibDate("2026-08-18", "02:00").getTime());
  });

  test("ticket at 20:50 WIB Mon → SLA 21:20 WIB Mon (30 min wall clock)", () => {
    const deadline = computeSlaDeadline(wibDate("2026-08-17", "20:50"));
    expect(deadline.getTime()).toBe(wibDate("2026-08-17", "21:20").getTime());
  });

  test("ticket on Sunday midday → +4h wall clock", () => {
    const deadline = computeSlaDeadline(wibDate("2026-08-16", "12:00"));
    expect(deadline.getTime()).toBe(wibDate("2026-08-16", "16:00").getTime());
  });

  test("ticket at 06:00 WIB Mon (off-hours) → 10:00 WIB Mon (4h)", () => {
    const deadline = computeSlaDeadline(wibDate("2026-08-17", "06:00"));
    expect(deadline.getTime()).toBe(wibDate("2026-08-17", "10:00").getTime());
  });
});
