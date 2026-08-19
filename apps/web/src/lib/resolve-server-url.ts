export function resolveServerUrl(
  configuredUrl: string,
  browserHostname: string | undefined,
  isDevelopment: boolean,
) {
  // Same-origin relative path (e.g. "/rpc" in production behind Caddy):
  // the API lives on the same origin as the web app, so return the origin.
  // Consumers append their own path prefixes (orpc.ts adds "/rpc",
  // auth-client.ts uses the better-auth "/api/auth" basePath).
  if (configuredUrl.startsWith("/")) {
    const base =
      typeof window === "undefined"
        ? "http://localhost"
        : window.location.origin;
    return new URL(configuredUrl, base).origin;
  }

  const serverUrl = new URL(configuredUrl);

  if (isDevelopment && browserHostname) {
    serverUrl.hostname = browserHostname;
  }

  return serverUrl.toString().replace(/\/$/, "");
}
