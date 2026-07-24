const STATIC_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "0",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

export function buildCSP(corsOrigin: string): string {
  return [
    "default-src 'self'",
    `connect-src 'self' ${corsOrigin}`,
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' https://fonts.gstatic.com",
    "frame-ancestors 'none'",
  ].join("; ");
}

let cachedCsp: string | undefined;

const SECURITY_HEADERS: Record<string, string> = {
  ...STATIC_HEADERS,
  get "Content-Security-Policy"() {
    if (!cachedCsp) {
      const { env } =
        require("@cogito-app/env/server") as typeof import("@cogito-app/env/server");
      cachedCsp = buildCSP(env.CORS_ORIGIN);
    }
    return cachedCsp;
  },
};

export { SECURITY_HEADERS };
