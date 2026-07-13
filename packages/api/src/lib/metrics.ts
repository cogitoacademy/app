const MAX_PATHS = 200;
const requestCounts = new Map<string, number>();
const requestDurations = new Map<string, number[]>();

export function recordRequest(path: string, durationMs: number) {
  if (requestCounts.has(path) || requestCounts.size < MAX_PATHS) {
    requestCounts.set(path, (requestCounts.get(path) ?? 0) + 1);
    const durations = requestDurations.get(path) ?? [];
    durations.push(durationMs);
    if (durations.length > 1000) durations.shift();
    requestDurations.set(path, durations);
  }
}

export function getMetrics(): Record<
  string,
  { path: string; count: number; avgMs: number }
> {
  const result: Record<string, { path: string; count: number; avgMs: number }> =
    {};
  for (const [path, count] of requestCounts.entries()) {
    result[path] = {
      path,
      count,
      avgMs:
        (requestDurations.get(path) ?? []).reduce((a, b) => a + b, 0) / count,
    };
  }
  return result;
}
