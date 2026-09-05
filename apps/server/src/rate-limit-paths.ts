/**
 * Maps an incoming request path to the rate limiter that should apply.
 *
 * RPC paths are the oRPC procedure keys with slashes (e.g. /rpc/booking/listMine),
 * NOT dotted names — dotted patterns never match and silently disable the limit.
 */
export type RateLimitKind =
  | "payment"
  | "invite"
  | "booking"
  | "search"
  | "support"
  | "achievement"
  | "upload"
  | "content";

// NOTE: better-auth registers its endpoints WITHOUT trailing slashes
// (`/api/auth/request-password-reset`, `/api/auth/reset-password`,
// `/api/auth/change-email`, `/api/auth/sign-in/email`, `/api/auth/email-otp/*`).
// Matching must be segment-boundary-based, not literal-prefix-based, so an
// exact endpoint path never falls through the limiter (S4 — brute-force
// password reset / OTP email spam would otherwise be unthrottled).
const AUTH_PATH_PREFIXES = [
  "/api/auth/sign-in",
  "/api/auth/sign-up",
  "/api/auth/request-password-reset",
  "/api/auth/reset-password",
  // M3: email-OTP verification + password reset/change-email flows (G2)
  // were previously unthrottled — every email-OTP request mints an OTP email,
  // so an unauthenticated spammer could burn the Resend quota.
  "/api/auth/email-otp",
  "/api/auth/forget-password",
  "/api/auth/change-email",
];

const READ_ONLY_BOOKING_PATHS = new Set([
  "/rpc/booking/get",
  "/rpc/booking/getRescheduleAvailability",
  "/rpc/booking/getSessionNotes",
  "/rpc/booking/listMine",
  "/rpc/booking/listSessions",
]);

export function matchAuthPath(path: string): boolean {
  const urlPath = path.split("?")[0] ?? path;
  return AUTH_PATH_PREFIXES.some(
    (p) => urlPath === p || urlPath.startsWith(`${p}/`),
  );
}

export function matchRateLimitPath(path: string): RateLimitKind | null {
  const urlPath = path.split("?")[0] ?? path;

  if (urlPath === "/rpc/payment/createPurchase") return "payment";
  if (urlPath.startsWith("/rpc/invite/verify")) return "invite";
  // Booking detail/list reads are protected by their procedures but must not
  // consume the 30/minute mutation bucket. A normal booking page refreshes
  // these queries several times while invalidating caches after an action;
  // counting them by shared IP can make the reschedule dialog return 429 even
  // though the user has made only a handful of booking changes.
  if (READ_ONLY_BOOKING_PATHS.has(urlPath)) return null;
  if (urlPath.startsWith("/rpc/booking/")) return "booking";
  if (
    urlPath === "/rpc/auth/students/search" ||
    urlPath === "/rpc/auth/searchStudents"
  ) {
    return "search";
  }
  // M3: support tickets are user-reported abuse/lateness claims (SLA-driven);
  // achievement submissions and upload URL creations are cheap to spam and
  // mint real external resources (R2 presigned URLs, moderation queue rows).
  if (urlPath === "/rpc/support/createTicket") return "support";
  if (urlPath === "/rpc/achievement/create") return "achievement";
  if (urlPath === "/rpc/upload/createUploadUrl") return "upload";
  // The Knowledge Bank file proxy streams real bytes (bandwidth) — 30/min.
  if (urlPath.startsWith("/content/knowledge-bank/")) return "content";

  return null;
}
