const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

type OverrideRangeValue = {
  start: string;
  end: string;
};

type ExistingAvailability = {
  startDate: string | Date;
  endDate: string | Date;
  isRecurring: boolean;
};

export function getDateOverrideValidationError({
  dates,
  ranges,
  minimumDate,
  existingSlots,
}: {
  dates: readonly string[];
  ranges: readonly OverrideRangeValue[];
  minimumDate: string;
  existingSlots: readonly ExistingAvailability[];
}) {
  if (dates.length === 0) return "Choose at least one date.";
  if (dates.length > 14) return "Choose no more than 14 dates.";
  if (new Set(dates).size !== dates.length)
    return "Remove duplicate override dates.";
  if (dates.some((date) => date < minimumDate))
    return "Override dates must be in the future.";
  if (ranges.length === 0) return "Add at least one time range.";
  if (ranges.length > 4) return "Add no more than four time ranges.";

  for (const range of ranges) {
    if (!TIME_PATTERN.test(range.start) || !TIME_PATTERN.test(range.end))
      return "Enter every time in 24-hour HH:MM format.";
    if (range.end <= range.start)
      return "Every end time must be after its start time.";
  }

  const sortedRanges = ranges.toSorted((left, right) =>
    left.start.localeCompare(right.start),
  );
  if (
    sortedRanges.some(
      (range, index) => index > 0 && range.start < sortedRanges[index - 1]!.end,
    )
  ) {
    return "Override time ranges must not overlap.";
  }

  const oneOffSlots = existingSlots.filter((slot) => !slot.isRecurring);
  for (const date of dates) {
    for (const range of ranges) {
      const start = new Date(`${date}T${range.start}:00+07:00`);
      const end = new Date(`${date}T${range.end}:00+07:00`);
      if (
        oneOffSlots.some((slot) => {
          const existingStart = new Date(slot.startDate);
          const existingEnd = new Date(slot.endDate);
          return start < existingEnd && end > existingStart;
        })
      ) {
        return `${date} has an existing one-off availability window during these hours.`;
      }
    }
  }

  return null;
}
