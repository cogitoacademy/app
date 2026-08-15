/**
 * Maps an incoming request path to the rate limiter that should apply.
 *
 * RPC paths are the oRPC procedure keys with slashes (e.g. /rpc/booking/listMine),
 * NOT dotted names — dotted patterns never match and silently disable the limit.
 */
export type RateLimitKind = "payment" | "invite" | "booking" | "search";

const AUTH_PATHS = ["/api/auth/sign-in/", "/api/auth/sign-up/"];

export function matchAuthPath(path: string): boolean {
  return AUTH_PATHS.some((p) => path.startsWith(p));
}

export function matchRateLimitPath(path: string): RateLimitKind | null {
  const urlPath = path.split("?")[0] ?? path;

  if (urlPath === "/rpc/payment/createPurchase") return "payment";
  if (urlPath.startsWith("/rpc/invite/verify")) return "invite";
  if (urlPath.startsWith("/rpc/booking/")) return "booking";
  if (urlPath.startsWith("/rpc/auth/searchStudents")) return "search";

  return null;
}
