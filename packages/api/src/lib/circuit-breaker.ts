import { serviceUnavailable } from "./errors";
import { COGITO_NS } from "./redis";
import type { RedisClient } from "./redis";

export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerOptions {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenMaxAttempts: number;
  name?: string;
  monitor?: (state: CircuitState, error?: unknown) => void;
  redis?: RedisClient;
}

export class CircuitBreaker {
  private state: CircuitState = "closed";
  private failureCount = 0;
  private lastFailureTime = 0;
  private halfOpenAttempts = 0;
  private options: CircuitBreakerOptions;
  private redis: RedisClient | null;

  constructor(options: CircuitBreakerOptions) {
    this.options = options;
    this.redis = options.redis ?? null;
  }

  private get redisKey(): string {
    return `${COGITO_NS.CIRCUIT_BREAKER}:${this.options.name ?? "default"}`;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    await this.loadState();

    if (this.state === "open") {
      if (Date.now() - this.lastFailureTime < this.options.resetTimeoutMs) {
        throw serviceUnavailable("Circuit breaker is open");
      }
      this.state = "half-open";
      this.halfOpenAttempts = 0;
    }

    try {
      const result = await fn();
      await this.onSuccess();
      return result;
    } catch (error) {
      await this.onFailure(error);
      throw error;
    }
  }

  private async loadState(): Promise<void> {
    if (!this.redis) return;
    try {
      const data = await this.redis.hgetall(this.redisKey);
      if (data && data.state) {
        this.state = data.state as CircuitState;
        this.failureCount = parseInt(data.failureCount ?? "0", 10);
        this.lastFailureTime = parseInt(data.lastFailureTime ?? "0", 10);
        this.halfOpenAttempts = parseInt(data.halfOpenAttempts ?? "0", 10);
      }
    } catch {
      // use in-memory state
    }
  }

  private async saveState(): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.hset(
        this.redisKey,
        ["state", this.state],
        ["failureCount", String(this.failureCount)],
        ["lastFailureTime", String(this.lastFailureTime)],
        ["halfOpenAttempts", String(this.halfOpenAttempts)],
      );
      await this.redis.expire(
        this.redisKey,
        Math.ceil(this.options.resetTimeoutMs / 1000) * 2,
      );
    } catch {
      // best effort
    }
  }

  private async onSuccess(): Promise<void> {
    this.failureCount = 0;
    this.state = "closed";
    this.halfOpenAttempts = 0;
    await this.saveState();
  }

  private async onFailure(error: unknown): Promise<void> {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    this.options.monitor?.(this.state, error);

    if (this.state === "half-open") {
      this.halfOpenAttempts++;
      if (this.halfOpenAttempts >= this.options.halfOpenMaxAttempts) {
        this.state = "open";
      }
    } else if (this.failureCount >= this.options.failureThreshold) {
      this.state = "open";
    }
    await this.saveState();
  }

  getState(): CircuitState {
    return this.state;
  }
}
