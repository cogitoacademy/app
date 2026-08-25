/**
 * Sanity content file proxy hardening (backend finalization Task 3/4):
 *
 * The Knowledge Bank file route proxies the Sanity asset URL server-side.
 * The upstream URL comes from the Sanity API (a trusted datasource), but
 * defense-in-depth keeps it bounded:
 *   - host allowlist: `cdn.sanity.io` / `*.sanity.io` only
 *   - 10s fetch timeout (AbortController)
 *   - 5MB cap enforced on `content-length` AND on the streamed body
 *     (a bounded ReadableStream wrapper counts bytes and aborts overage)
 *
 * On any failure the route responds 502 (never leaks the upstream error).
 */
export const MAX_PROXY_BYTES = 5 * 1024 * 1024;
export const PROXY_TIMEOUT_MS = 10_000;

export function isAllowedProxyHost(host: string): boolean {
  if (!host) return false;
  return host === "cdn.sanity.io" || host.endsWith(".sanity.io");
}

export type ProxyFetchResult =
  | { ok: true; body: ReadableStream<Uint8Array>; contentType: string | null }
  | { ok: false; reason: 502 };

/**
 * Fetches and bounds a proxied file. The returned body is a new bounded
 * ReadableStream that errors once the byte cap is exceeded, so the caller can
 * hand it straight to the HTTP response without buffering the whole file.
 */
export async function fetchProxyFile(
  fileUrl: string,
  opts: {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    maxBytes?: number;
  } = {},
): Promise<ProxyFetchResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? PROXY_TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? MAX_PROXY_BYTES;

  let url: URL;
  try {
    url = new URL(fileUrl);
  } catch {
    return { ok: false, reason: 502 };
  }
  if (!isAllowedProxyHost(url.hostname)) {
    return { ok: false, reason: 502 };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let upstream: Response;
    try {
      upstream = await fetchImpl(fileUrl, { signal: controller.signal });
    } catch {
      return { ok: false, reason: 502 };
    }
    if (!upstream.ok || !upstream.body) {
      return { ok: false, reason: 502 };
    }

    const contentLength = Number(upstream.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      return { ok: false, reason: 502 };
    }

    const contentType = upstream.headers.get("content-type");

    // Buffer with a hard cap so an oversized file is rejected with 502 BEFORE
    // the response starts (a status can't change once the body is streaming).
    // The cap bounds memory: at most maxBytes + chunk bytes per request.
    const reader = upstream.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return { ok: false, reason: 502 };
      }
      chunks.push(value);
    }

    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    });

    return { ok: true, body, contentType };
  } finally {
    clearTimeout(timer);
  }
}
