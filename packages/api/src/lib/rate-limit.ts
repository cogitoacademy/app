const store = new Map<string, { count: number; resetAt: number }>();
const MAX_ENTRIES = 10_000;
let lastCleanup = 0;
const CLEANUP_INTERVAL = 60_000;

export function resetRateLimitStore() {
  store.clear();
  lastCleanup = 0;
}

export function rateLimit(options: {
  windowMs: number;
  maxRequests: number;
  keyPrefix?: string;
}) {
  return (identifier: string): { allowed: boolean; retryAfterMs: number } => {
    const key = `${options.keyPrefix ?? ""}:${identifier}`;
    const now = Date.now();

    if (now - lastCleanup > CLEANUP_INTERVAL) {
      for (const [k, v] of store) {
        if (now > v.resetAt) store.delete(k);
      }
      lastCleanup = now;
    }

    const entry = store.get(key);

    if (!entry || now > entry.resetAt) {
      if (store.size >= MAX_ENTRIES) {
        for (const [k, v] of store) {
          if (now > v.resetAt) store.delete(k);
        }
      }
      store.set(key, { count: 1, resetAt: now + options.windowMs });
      return { allowed: true, retryAfterMs: 0 };
    }

    if (entry.count >= options.maxRequests) {
      return { allowed: false, retryAfterMs: entry.resetAt - now };
    }

    entry.count += 1;
    return { allowed: true, retryAfterMs: 0 };
  };
}
