export class IdempotencyStore {
  private store = new Map<string, { result: unknown; timestamp: number }>();
  private maxAge: number;
  private maxEntries: number;
  private cleanupInterval: number;
  private lastCleanup = Date.now();

  constructor(
    options: {
      prefix?: string;
      maxAgeMs?: number;
      cleanupIntervalMs?: number;
      maxEntries?: number;
    } = {},
  ) {
    this.maxAge = options.maxAgeMs ?? 24 * 60 * 60 * 1000;
    this.cleanupInterval = options.cleanupIntervalMs ?? 60 * 60 * 1000;
    this.maxEntries = options.maxEntries ?? 10_000;
  }

  isProcessed(key: string): boolean {
    this.maybeCleanup();
    const entry = this.store.get(key);
    if (!entry) return false;
    if (Date.now() - entry.timestamp > this.maxAge) {
      this.store.delete(key);
      return false;
    }
    return true;
  }

  markProcessed(key: string, result: unknown): void {
    this.evictOldest();
    this.store.set(key, { result, timestamp: Date.now() });
  }

  getResult(key: string): unknown | undefined {
    this.maybeCleanup();
    return this.store.get(key)?.result;
  }

  private maybeCleanup(): void {
    const now = Date.now();
    if (now - this.lastCleanup < this.cleanupInterval) return;
    for (const [key, entry] of this.store) {
      if (now - entry.timestamp > this.maxAge) {
        this.store.delete(key);
      }
    }
    this.lastCleanup = now;
  }

  private evictOldest(): void {
    if (this.store.size < this.maxEntries) return;
    let oldest: string | null = null;
    let oldestTime = Infinity;
    for (const [key, entry] of this.store) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldest = key;
      }
    }
    if (oldest) this.store.delete(oldest);
  }
}

export const bookingIdempotency = new IdempotencyStore();
export const webhookIdempotency = new IdempotencyStore({
  maxAgeMs: 24 * 60 * 60 * 1000,
  cleanupIntervalMs: 60 * 60 * 1000,
});

export function generateIdempotencyKey(
  prefix: string,
  ...parts: string[]
): string {
  return `${prefix}:${parts.join(":")}`;
}
