const MAX_PATHS = 200;
const TTL_MS = 10 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60_000;

// Prometheus exposition notes (P1):
// - This process scrapes a SINGLE app replica, so every request series
//   carries instance="single". Aggregating across replicas (federation or a
//   shared gateway) is an explicit multi-replica follow-up, not solved here.
// - Duration histogram buckets (ms) follow the service's latency profile:
//   sub-10ms cache/validation hits through multi-second upstream waits.

const DURATION_BUCKETS_MS = [
  5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000,
];

const BREAKER_STATE_VALUE = {
  closed: 0,
  "half-open": 1,
  open: 2,
} as const;

export type BreakerStateName = keyof typeof BREAKER_STATE_VALUE;

export interface ExpositionInput {
  dlqDepth?: number;
  breakers?: Record<string, BreakerStateName>;
}

interface Series {
  path: string;
  method: string;
  status: number;
  count: number;
  sum: number;
  durations: number[];
}

const series = new Map<string, Series>();
const lastAccess = new Map<string, number>();
let lastCleanup = 0;

function seriesKey(path: string, method: string, status: number): string {
  return JSON.stringify([method, status, path]);
}

export function recordRequest(
  path: string,
  durationMs: number,
  method = "UNKNOWN",
  status = 0,
) {
  const now = Date.now();
  const key = seriesKey(path, method, status);
  if (series.has(key) || series.size < MAX_PATHS) {
    lastAccess.set(key, now);
    const entry = series.get(key) ?? {
      path,
      method,
      status,
      count: 0,
      sum: 0,
      durations: [],
    };
    entry.count += 1;
    entry.sum += durationMs;
    entry.durations.push(durationMs);
    if (entry.durations.length > 1000) entry.durations.shift();
    series.set(key, entry);
  }
  maybeCleanup(now);
}

function maybeCleanup(now: number) {
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  for (const [key, time] of lastAccess) {
    if (now - time > TTL_MS) {
      series.delete(key);
      lastAccess.delete(key);
    }
  }
  for (const key of lastAccess.keys()) {
    if (!series.has(key)) lastAccess.delete(key);
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
  for (const entry of series.values()) {
    const durations = entry.durations;
    const avg =
      durations.length > 0
        ? durations.reduce((a, b) => a + b, 0) / durations.length
        : 0;
    const existing = result[entry.path];
    if (existing) {
      const total = existing.count + entry.count;
      existing.avgMs =
        (existing.avgMs * existing.count + avg * entry.count) / total;
      existing.count = total;
    } else {
      result[entry.path] = { path: entry.path, count: entry.count, avgMs: avg };
    }
  }
  return result;
}

function escapeLabelValue(value: string | number): string {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n");
}

function requestLabels(entry: Series): string {
  return `path="${escapeLabelValue(entry.path)}",method="${escapeLabelValue(entry.method)}",status="${entry.status}",instance="single"`;
}

/**
 * Renders the Prometheus text exposition (version 0.0.4) for `GET /metrics`.
 *
 * Counters/histograms come from the in-process `recordRequest` telemetry;
 * `dlqDepth` (fresh DLQ failures, `-1` when unknown) and `breakers`
 * (Redis-backed circuit-breaker states) are supplied by the route, which
 * reads them from the shared Redis. Either gauge section is omitted when its
 * input is absent so a bare `renderExposition()` still emits valid output.
 */
export function renderExposition(input: ExpositionInput = {}): string {
  maybeCleanup(Date.now());
  const lines: string[] = [];

  lines.push(
    "# HELP http_requests_total Total HTTP requests by path, method and status.",
  );
  lines.push("# TYPE http_requests_total counter");
  for (const entry of series.values()) {
    lines.push(`http_requests_total{${requestLabels(entry)}} ${entry.count}`);
  }

  lines.push(
    "# HELP http_request_duration_ms HTTP request duration in milliseconds.",
  );
  lines.push("# TYPE http_request_duration_ms histogram");
  for (const entry of series.values()) {
    const labels = requestLabels(entry);
    for (const bucket of DURATION_BUCKETS_MS) {
      let cumulative = 0;
      for (const d of entry.durations) {
        if (d <= bucket) cumulative += 1;
      }
      lines.push(
        `http_request_duration_ms_bucket{${labels},le="${bucket}"} ${cumulative}`,
      );
    }
    lines.push(
      `http_request_duration_ms_bucket{${labels},le="+Inf"} ${entry.count}`,
    );
    lines.push(`http_request_duration_ms_sum{${labels}} ${entry.sum}`);
    lines.push(`http_request_duration_ms_count{${labels}} ${entry.count}`);
  }

  if (input.dlqDepth !== undefined) {
    lines.push(
      "# HELP dlq_fresh_depth Fresh dead-letter queue depth (failures within the freshness window; -1 when unknown).",
    );
    lines.push("# TYPE dlq_fresh_depth gauge");
    lines.push(`dlq_fresh_depth{instance="single"} ${input.dlqDepth}`);
  }

  if (input.breakers !== undefined) {
    lines.push(
      "# HELP breaker_state Circuit-breaker state by name (0=closed, 1=half-open, 2=open).",
    );
    lines.push("# TYPE breaker_state gauge");
    for (const name of Object.keys(input.breakers).sort()) {
      const state = input.breakers[name] as BreakerStateName;
      lines.push(
        `breaker_state{name="${escapeLabelValue(name)}",instance="single"} ${BREAKER_STATE_VALUE[state]}`,
      );
    }
  }

  return `${lines.join("\n")}\n`;
}

export function _resetForTest() {
  series.clear();
  lastAccess.clear();
  lastCleanup = 0;
}
