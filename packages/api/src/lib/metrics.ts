const MAX_PATHS = 200;
const TTL_MS = 10 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60_000;

const requestCounts = new Map<string, number>();
const requestDurations = new Map<string, number[]>();
const lastAccess = new Map<string, number>();
let lastCleanup = 0;

export function recordRequest(path: string, durationMs: number) {
  const now = Date.now();
  lastAccess.set(path, now);
  if (requestCounts.has(path) || requestCounts.size < MAX_PATHS) {
    requestCounts.set(path, (requestCounts.get(path) ?? 0) + 1);
    const durations = requestDurations.get(path) ?? [];
    durations.push(durationMs);
    if (durations.length > 1000) durations.shift();
    requestDurations.set(path, durations);
  }
  maybeCleanup(now);
}

function maybeCleanup(now: number) {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  for (const [path, time] of lastAccess) {
    if (now - time > TTL_MS) {
      requestCounts.delete(path);
      requestDurations.delete(path);
      lastAccess.delete(path);
    }
  }
  lastCleanup = now;
}

export function getMetrics(): Record<
  string,
  { path: string; count: number; avgMs: number }
> {
  maybeCleanup(Date.now());
  const result: Record<string, { path: string; count: number; avgMs: number }> =
    {};
  for (const [path, count] of requestCounts.entries()) {
    const durations = requestDurations.get(path) ?? [];
    result[path] = {
      path,
      count,
      avgMs:
        durations.length > 0
          ? durations.reduce((a, b) => a + b, 0) / durations.length
          : 0,
    };
  }
  return result;
}

export function _resetForTest() {
  requestCounts.clear();
  requestDurations.clear();
  lastAccess.clear();
  lastCleanup = 0;
}
