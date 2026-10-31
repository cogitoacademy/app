import { existsSync } from "node:fs";
import path from "node:path";

const ENV_FILE_CANDIDATES = [
  "../../apps/server/.env.test",
  "../../apps/server/.env.test.example",
];
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const TEST_DATABASE_PORTS = new Map<string, ReadonlySet<string>>([
  ["cogito-test", new Set(["6767", "6768", "6769"])],
  ["cogito-test-payout", new Set(["6770"])],
]);
const DATABASE_ERROR =
  "E2E DATABASE_URL must target loopback PostgreSQL cogito-test on port 6767, 6768, or 6769, or cogito-test-payout on port 6770.";

export type E2eEnvironment = {
  databaseUrl: string;
  serverUrl: string;
  webUrl: string;
  serverPort: number;
  webPort: number;
};

export function resolveE2eEnvFile(cwd: string, env: NodeJS.ProcessEnv): string {
  const envFile =
    env.ENV_FILE ??
    ENV_FILE_CANDIDATES.find((candidate) =>
      existsSync(path.resolve(cwd, candidate)),
    ) ??
    "../../apps/server/.env.test.example";

  return path.resolve(cwd, envFile);
}

export function resolveE2eEnvironment(env: NodeJS.ProcessEnv): E2eEnvironment {
  if (env.NODE_ENV !== "test") {
    throw new Error("E2E requires explicit NODE_ENV=test configuration.");
  }

  const databaseUrl = parseDatabaseUrl(env.DATABASE_URL);
  const apiUrl = parseLoopbackHttpUrl(
    env.SERVER_URL ?? env.BETTER_AUTH_URL ?? "http://localhost:3101",
    "SERVER_URL",
  );

  if (env.BETTER_AUTH_URL !== undefined) {
    const authUrl = parseLoopbackHttpUrl(
      env.BETTER_AUTH_URL,
      "BETTER_AUTH_URL",
    );
    if (authUrl.origin !== apiUrl.origin) {
      throw new Error("E2E BETTER_AUTH_URL must match the local test API.");
    }
  }

  const webUrl = parseLoopbackHttpUrl(
    env.WEB_URL ?? "http://localhost:3100",
    "WEB_URL",
  );
  const serverPort = resolvePort(env.PORT, apiUrl, "PORT");
  const webPort = resolvePort(env.WEB_PORT, webUrl, "WEB_PORT");

  if (env.VITE_SERVER_URL !== undefined) {
    let viteServerUrl: URL;
    try {
      viteServerUrl = new URL(env.VITE_SERVER_URL, apiUrl);
    } catch {
      throw new Error(
        "E2E VITE_SERVER_URL must resolve to the local test API.",
      );
    }
    if (viteServerUrl.origin !== apiUrl.origin) {
      throw new Error(
        "E2E VITE_SERVER_URL must resolve to the local test API.",
      );
    }
  }

  return {
    databaseUrl,
    serverUrl: apiUrl.origin,
    webUrl: webUrl.origin,
    serverPort,
    webPort,
  };
}

function parseDatabaseUrl(value: string | undefined): string {
  if (!value) {
    throw new Error(DATABASE_ERROR);
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(DATABASE_ERROR);
  }

  const databaseName = url.pathname.replace(/^\//, "");
  const expectedPorts = TEST_DATABASE_PORTS.get(databaseName);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !isLoopbackHost(url.hostname) ||
    !expectedPorts?.has(url.port)
  ) {
    throw new Error(DATABASE_ERROR);
  }

  return value;
}

function parseLoopbackHttpUrl(value: string, name: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`E2E ${name} must be a loopback HTTP origin.`);
  }

  if (
    url.protocol !== "http:" ||
    !isLoopbackHost(url.hostname) ||
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error(`E2E ${name} must be a loopback HTTP origin.`);
  }

  return url;
}

function isLoopbackHost(hostname: string): boolean {
  const normalizedHost = hostname.toLowerCase();
  const host =
    normalizedHost.startsWith("[") && normalizedHost.endsWith("]")
      ? normalizedHost.slice(1, -1)
      : normalizedHost;

  return LOOPBACK_HOSTS.has(host);
}

function resolvePort(
  value: string | undefined,
  url: URL,
  name: string,
): number {
  const urlPort = Number(url.port || "80");
  if (value === undefined) return urlPort;

  const port = Number(value);
  if (!/^\d+$/.test(value) || port < 1 || port > 65_535 || port !== urlPort) {
    throw new Error(`E2E ${name} must match its configured loopback URL port.`);
  }

  return port;
}
