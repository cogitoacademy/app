import { serverUrl } from "./server-url";

/**
 * Local development uploads are served by the API origin while the Vite app
 * commonly runs on a different port. Keep persisted values untouched, but
 * resolve local paths before rendering or uploading from the browser. Remote
 * values are restricted to HTTP(S) so untrusted form values cannot become
 * script-like image sources.
 */
export function resolveProfileImageUrl(
  value: string | null | undefined,
): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("/")) return `${serverUrl}${trimmed}`;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return undefined;
}
