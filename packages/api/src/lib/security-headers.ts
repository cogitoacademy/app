import { env } from "@cogito-app/env/server";

const STATIC_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "0",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
};

export function buildCSP(
  corsOrigin: string,
  frameAncestors = "'none'",
): string {
  return [
    "default-src 'self'",
    `connect-src 'self' ${corsOrigin}`,
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' https://fonts.gstatic.com",
    `frame-ancestors ${frameAncestors}`,
  ].join("; ");
}

const SECURITY_HEADERS: Record<string, string> = {
  ...STATIC_HEADERS,
  "Content-Security-Policy": buildCSP(env.CORS_ORIGIN),
};

const KNOWLEDGE_BANK_FILE_PATH = /^\/content\/knowledge-bank\/[^/]+\/file\/?$/;

export function securityHeadersForPath(
  pathname: string,
): Record<string, string> {
  if (!KNOWLEDGE_BANK_FILE_PATH.test(pathname)) return SECURITY_HEADERS;

  const headers = { ...SECURITY_HEADERS };
  delete headers["X-Frame-Options"];
  return {
    ...headers,
    "Content-Security-Policy": buildCSP(env.CORS_ORIGIN, env.CORS_ORIGIN),
  };
}

export { SECURITY_HEADERS };
