const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

export function reportDateWindow(generatedAt: Date) {
  if (Number.isNaN(generatedAt.getTime())) {
    throw new RangeError("Report generation time must be a valid date");
  }

  const wib = new Date(generatedAt.getTime() + WIB_OFFSET_MS);
  const targetMonth = wib.getUTCFullYear() * 12 + wib.getUTCMonth() - 3;
  const year = Math.floor(targetMonth / 12);
  const month = targetMonth - year * 12;
  const day = Math.min(
    wib.getUTCDate(),
    new Date(Date.UTC(year, month + 1, 0)).getUTCDate(),
  );

  return {
    startAt: new Date(Date.UTC(year, month, day) - WIB_OFFSET_MS),
    endAt: new Date(generatedAt),
  };
}
