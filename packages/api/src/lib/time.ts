export const WIB_TIMEZONE = "Asia/Jakarta";

export function nowUtc(): Date {
  return new Date();
}

export function isBeforeH2(scheduledStartAt: Date): boolean {
  const now = nowUtc();
  const h2Cutoff = new Date(scheduledStartAt.getTime() - 2 * 60 * 60 * 1000);
  return now < h2Cutoff;
}

export function isAfterH2(scheduledStartAt: Date): boolean {
  return !isBeforeH2(scheduledStartAt);
}

export function hasPassedByMinutes(
  scheduledStartAt: Date,
  minutes: number,
): boolean {
  const now = nowUtc();
  const threshold = new Date(scheduledStartAt.getTime() + minutes * 60 * 1000);
  return now >= threshold;
}

export function hoursFromNow(hours: number): Date {
  const d = nowUtc();
  return new Date(d.getTime() + hours * 60 * 60 * 1000);
}
