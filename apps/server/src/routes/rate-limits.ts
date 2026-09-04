import { rateLimit } from "@cogito-app/api/lib/rate-limit";
import { getRedisClient } from "@cogito-app/api/lib/redis";
import { getClientIp } from "@cogito-app/api/lib/request-id";
import { env } from "@cogito-app/env/server";
import { matchAuthPath, matchRateLimitPath } from "../rate-limit-paths";
import type { Elysia } from "elysia";

const redis = getRedisClient();

/**
 * Per-kind rate limiters. The kinds mirror `RateLimitKind` in
 * rate-limit-paths.ts; the onRequest hook below dispatches by path.
 */
const LIMITERS: Record<string, { windowMs: number; maxRequests: number }> = {
  auth: { windowMs: 60_000, maxRequests: 10 },
  payment: { windowMs: 60_000, maxRequests: 5 },
  invite: { windowMs: 60_000, maxRequests: 10 },
  booking: { windowMs: 60_000, maxRequests: 30 },
  search: { windowMs: 60_000, maxRequests: 30 },
  // M3: support ticket creation (SLA-driven abuse/lateness claims) — 5/min.
  support: { windowMs: 60_000, maxRequests: 5 },
  // M3: achievement submissions (moderation queue spam) — 30/min.
  achievement: { windowMs: 60_000, maxRequests: 30 },
  // M3: upload URL creation (mints R2 presigned URLs) — 30/min.
  upload: { windowMs: 60_000, maxRequests: 30 },
  // Content proxy: the Sanity file route streams real bytes (bandwidth) — 30/min.
  content: { windowMs: 60_000, maxRequests: 30 },
};

const limiters = new Map(
  Object.entries(LIMITERS).map(([kind, cfg]) => [
    kind,
    rateLimit({ ...cfg, keyPrefix: kind, redis }),
  ]),
);

function tooManyRequests(retryAfterMs: number): Response {
  return new Response(JSON.stringify({ error: "Too many requests" }), {
    status: 429,
    headers: {
      "Content-Type": "application/json",
      "Retry-After": String(Math.ceil(retryAfterMs / 1000)),
    },
  });
}

/**
 * Applies the auth limiter to better-auth paths and the per-kind limiter to
 * matched RPC/content paths. Returns a 429 response when throttled, null
 * otherwise.
 */
export async function applyRateLimits(
  request: Request,
  server?: { requestIP(request: Request): { address: string } | null },
): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;
  const ip = getClientIp(request, env.TRUST_PROXY, server ?? undefined);

  if (matchAuthPath(path)) {
    const { allowed, retryAfterMs } = await limiters.get("auth")!(ip);
    if (!allowed) return tooManyRequests(retryAfterMs);
  }

  const rateLimitKind = matchRateLimitPath(path);
  if (rateLimitKind) {
    const limiter = limiters.get(rateLimitKind);
    if (limiter) {
      const { allowed, retryAfterMs } = await limiter(ip);
      if (!allowed) return tooManyRequests(retryAfterMs);
    }
  }

  return null;
}

export function registerRateLimits(app: Elysia) {
  return app.onRequest(async ({ request, server }) => {
    const blocked = await applyRateLimits(request, server ?? undefined);
    if (blocked) return blocked;
  });
}
