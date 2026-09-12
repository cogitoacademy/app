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

export type MetricsPaymentProvider = "stub" | "xendit" | "midtrans";
export type MetricsProviderMode = "test" | "live" | "none";

export interface ExpositionInput {
  dlqDepth?: number;
  breakers?: Record<string, BreakerStateName>;
  /**
   * Active payment provider for the `app_info` gauge. Defaults to
   * `process.env.PAYMENT_PROVIDER` (read at call time so tests can stub the
   * env, like `GIT_SHA`), falling back to `"stub"` when unset/unknown.
   */
  provider?: MetricsPaymentProvider;
  /**
   * Active provider mode for the `app_info` gauge. Defaults to the matching
   * `XENDIT_MODE`/`MIDTRANS_MODE` env var, or `"none"` when the mode env var
   * is unset/unknown. Always `"none"` for the stub provider (which has no
   * mode concept), even if a mode is passed explicitly.
   */
  providerMode?: MetricsProviderMode;
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

const KB_PREFIX = "/content/knowledge-bank/";
const UPLOADS_PREFIX = "/uploads/";

/**
 * Collapses high-cardinality dynamic path segments to `:id` placeholders so
 * per-ID URLs cannot mint one Prometheus series per ID against MAX_PATHS.
 *
 * - `/content/knowledge-bank/<resourceId>/file` (and any other
 *   `/content/knowledge-bank/<id>[/...]` shape) → first segment becomes `:id`,
 *   the static suffix (`file`, …) is preserved.
 * - `/uploads/<...>` → every segment after `/uploads/` becomes `:id`
 *   (depth is preserved, cardinality is not).
 * - Everything else (`/rpc/*`, `/health`, `/metrics`, …) is returned
 *   byte-identical. Already-normalized (`:id`) input is stable.
 */
export function normalizeMetricsPath(path: string): string {
  if (path.startsWith(KB_PREFIX)) {
    const rest = path.slice(KB_PREFIX.length);
    if (!rest) return path;
    const segments = rest.split("/");
    segments[0] = ":id";
    return `${KB_PREFIX}${segments.join("/")}`;
  }
  if (path === "/uploads" || path === "/uploads/") return path;
  if (path.startsWith(UPLOADS_PREFIX)) {
    const rest = path.slice(UPLOADS_PREFIX.length);
    return `${UPLOADS_PREFIX}${rest
      .split("/")
      .map(() => ":id")
      .join("/")}`;
  }
  return path;
}

export function recordRequest(
  path: string,
  durationMs: number,
  method = "UNKNOWN",
  status = 0,
) {
  const normalizedPath = normalizeMetricsPath(path);
  const now = Date.now();
  const key = seriesKey(normalizedPath, method, status);
  if (series.has(key) || series.size < MAX_PATHS) {
    lastAccess.set(key, now);
    const entry = series.get(key) ?? {
      path: normalizedPath,
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

function isMetricsPaymentProvider(
  value: unknown,
): value is MetricsPaymentProvider {
  return value === "stub" || value === "xendit" || value === "midtrans";
}

function isMetricsProviderMode(value: unknown): value is MetricsProviderMode {
  return value === "test" || value === "live" || value === "none";
}

function resolveExpositionProvider(
  explicit?: MetricsPaymentProvider,
): MetricsPaymentProvider {
  if (isMetricsPaymentProvider(explicit)) return explicit;
  const fromEnv = process.env.PAYMENT_PROVIDER?.trim();
  if (isMetricsPaymentProvider(fromEnv)) return fromEnv;
  return "stub";
}

function resolveExpositionProviderMode(
  provider: MetricsPaymentProvider,
  explicit?: MetricsProviderMode,
): MetricsProviderMode {
  // The stub provider has no mode concept — the dashboards contract fixes
  // provider_mode="none" whenever provider="stub".
  if (provider === "stub") return "none";
  if (isMetricsProviderMode(explicit)) return explicit;
  const fromEnv =
    provider === "xendit"
      ? process.env.XENDIT_MODE?.trim()
      : process.env.MIDTRANS_MODE?.trim();
  if (isMetricsProviderMode(fromEnv) && fromEnv !== "none") return fromEnv;
  return "none";
}

/**
 * Renders the Prometheus text exposition (version 0.0.4) for `GET /metrics`.
 *
 * Counters/histograms come from the in-process `recordRequest` telemetry;
 * `dlqDepth` (fresh DLQ failures, `-1` when unknown) and `breakers`
 * (Redis-backed circuit-breaker states) are supplied by the route, which
 * reads them from the shared Redis. Either gauge section is omitted when its
 * input is absent so a bare `renderExposition()` still emits valid output.
 * `app_info{version,provider,provider_mode}` (deploy SHA from `GIT_SHA`,
 * `"dev"` fallback; provider from the explicit input or `PAYMENT_PROVIDER`;
 * mode from the explicit input or `XENDIT_MODE`/`MIDTRANS_MODE`, `"none"`
 * for stub) is always emitted so Prometheus can answer "which version and
 * payment configuration is running".
 */
export function renderExposition(input: ExpositionInput = {}): string {
  maybeCleanup(Date.now());
  const lines: string[] = [];

  // Deploy traceability: the running build SHA, so /metrics agrees with
  // /health `version` on which artifact is live (same source —
  // process.env.GIT_SHA baked by the Dockerfile, "dev" when unset). Provider
  // and mode are resolved the same way (explicit input wins, env fallback,
  // safe defaults) so the /metrics caller needs no changes to label the
  // active payment configuration. Read at call time so tests can stub env.
  const gitSha = process.env.GIT_SHA?.trim() || "dev";
  const provider = resolveExpositionProvider(input.provider);
  const providerMode = resolveExpositionProviderMode(
    provider,
    input.providerMode,
  );
  lines.push(
    "# HELP app_info Application build info (version carries the deploy SHA).",
  );
  lines.push("# TYPE app_info gauge");
  lines.push(
    `app_info{version="${escapeLabelValue(gitSha)}",provider="${provider}",provider_mode="${providerMode}"} 1`,
  );

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
