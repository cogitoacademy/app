export function resolveServerUrl(
  configuredUrl: string,
  browserHostname: string | undefined,
  isDevelopment: boolean,
) {
  const serverUrl = new URL(configuredUrl);

  if (isDevelopment && browserHostname) {
    serverUrl.hostname = browserHostname;
  }

  return serverUrl.toString().replace(/\/$/, "");
}
