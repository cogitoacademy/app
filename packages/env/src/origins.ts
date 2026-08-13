const PRIVATE_NETWORK_PATTERNS = [
  /^10(?:\.\d{1,3}){3}$/,
  /^192\.168(?:\.\d{1,3}){2}$/,
  /^172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}$/,
];

function getDevelopmentPort(configuredOrigin: string) {
  const url = new URL(configuredOrigin);
  return url.port || (url.protocol === "https:" ? "443" : "80");
}

function formatHttpOrigin(host: string, port: string) {
  return `http://${host}${port === "80" ? "" : `:${port}`}`;
}

export function getAuthTrustedOrigins(
  configuredOrigin: string,
  nodeEnv: "development" | "production" | "test",
) {
  if (nodeEnv === "production") return [configuredOrigin];

  const port = getDevelopmentPort(configuredOrigin);
  return [
    configuredOrigin,
    formatHttpOrigin("localhost", port),
    formatHttpOrigin("127.0.0.1", port),
    formatHttpOrigin("10.*.*.*", port),
    formatHttpOrigin("192.168.*.*", port),
    ...Array.from({ length: 16 }, (_, index) =>
      formatHttpOrigin(`172.${index + 16}.*.*`, port),
    ),
  ];
}

export function isAllowedFrontendOrigin(
  origin: string | null,
  configuredOrigin: string,
  nodeEnv: "development" | "production" | "test",
) {
  if (!origin) return false;
  if (origin === configuredOrigin) return true;
  if (nodeEnv === "production") return false;

  try {
    const url = new URL(origin);
    const port = url.port || (url.protocol === "https:" ? "443" : "80");
    const configuredPort = getDevelopmentPort(configuredOrigin);
    const isLoopback =
      url.hostname === "localhost" || url.hostname === "127.0.0.1";
    const isPrivateNetwork = PRIVATE_NETWORK_PATTERNS.some((pattern) =>
      pattern.test(url.hostname),
    );

    return (
      url.protocol === "http:" &&
      port === configuredPort &&
      (isLoopback || isPrivateNetwork)
    );
  } catch {
    return false;
  }
}
