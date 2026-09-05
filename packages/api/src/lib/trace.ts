import { AsyncLocalStorage } from "node:async_hooks";

export interface TraceCtx {
  traceId: string;
  userId?: string;
}

const als = new AsyncLocalStorage<TraceCtx>();

export function runWithTrace<T>(ctx: TraceCtx, fn: () => T): T {
  return als.run(ctx, fn);
}

export const getTrace = (): TraceCtx | undefined => als.getStore();

/**
 * Seeds the trace scope for the current async execution context without
 * wrapping a callback.
 *
 * Elysia's derive/onAfterHandle/onError hooks for one request share a single
 * async context, but `runWithTrace` (`als.run`) only keeps the store alive
 * for the duration of its synchronous callback — calling it inside `derive`
 * does NOT propagate to the route handler or `onAfterHandle` (verified:
 * handler sees `undefined`). `als.enterWith` persists for the remainder of
 * the request's async chain, which is what per-request seeding needs.
 * Downstream one-shot wrappers (BullMQ workers, tests) keep using
 * `runWithTrace`.
 */
export function enterTrace(ctx: TraceCtx): void {
  als.enterWith(ctx);
}

export function parseTraceparent(h: string) {
  const m = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/.exec(h.trim());
  return m ? { traceId: m[1], spanId: m[2], flags: m[3] } : null;
}

export function emitTraceparent(t: {
  traceId: string;
  spanId: string;
  flags: string;
}) {
  return `00-${t.traceId}-${t.spanId}-${t.flags}`;
}

/**
 * Stamps the current trace scope onto a BullMQ job-data payload (T1).
 *
 * Returns `{ traceId, userId? }` when a trace is active, otherwise `{}` so
 * system-cron scheduling (boot time, no request scope) keeps the previous
 * `data: {}` shape. Centralized here so the six `schedule*` job files stay
 * branch-free; both sides are covered in `trace.test.ts`.
 */
export function traceJobData(): { traceId?: string; userId?: string } {
  const t = als.getStore();
  if (!t?.traceId) return {};
  return t.userId
    ? { traceId: t.traceId, userId: t.userId }
    : { traceId: t.traceId };
}
