/**
 * NODE_ENV values that are treated as production-like: strict cookie
 * attributes, mandatory SSL/email/R2 config, OpenAPI hidden without a
 * session, and no stub payment provider.
 *
 * `staging` behaves like production for every guard that previously keyed
 * off `NODE_ENV === "production"` — the only difference is that staging may
 * keep the stub payment provider when STUB_WEBHOOK_ALLOWED=true (see
 * `stubCheckoutEnabled` in apps/server).
 */
export const PRODUCTION_LIKE_ENVS = new Set(["production", "staging"]);

export function isProductionLike(nodeEnv: string): boolean {
  return PRODUCTION_LIKE_ENVS.has(nodeEnv);
}

export type NodeEnv = "development" | "production" | "test" | "staging";
