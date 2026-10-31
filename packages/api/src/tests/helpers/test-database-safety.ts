const TEST_DATABASE_PORTS = new Map<string, ReadonlySet<string>>([
  ["cogito-test", new Set(["6767", "6768", "6769"])],
  ["cogito-test-settlement", new Set(["6767"])],
  ["cogito-test-payout", new Set(["6770"])],
]);
const RESETTABLE_DATABASE_TARGETS = new Set([
  "cogito-test:6769",
  "cogito-test-payout:6770",
]);
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const DATABASE_URL_PATTERN =
  /^(?<protocol>postgres|postgresql):\/\/(?:(?<username>[A-Za-z0-9._~-]+):(?<password>[A-Za-z0-9._~-]+)@)?(?<host>\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9.-]+):(?<port>[0-9]+)\/(?<database>[A-Za-z0-9_-]+)$/;

function getTestDatabaseTarget(databaseUrl: string | undefined) {
  if (!databaseUrl) return;

  const match = DATABASE_URL_PATTERN.exec(databaseUrl);
  if (!match?.groups) return;

  try {
    const url = new URL(databaseUrl);
    const host = match.groups.host.replace(/^\[|\]$/g, "").toLowerCase();
    const parsedHost = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    const database = match.groups.database;
    const port = match.groups.port;

    if (
      url.protocol !== `${match.groups.protocol}:` ||
      parsedHost !== host ||
      !LOOPBACK_HOSTS.has(host) ||
      url.port !== port ||
      url.pathname !== `/${database}` ||
      url.search !== "" ||
      url.hash !== "" ||
      !TEST_DATABASE_PORTS.get(database)?.has(port)
    ) {
      return;
    }

    return `${database}:${port}`;
  } catch {
    return;
  }
}

export function assertSafeTestDatabaseUrl(
  databaseUrl: string | undefined,
  nodeEnv: string | undefined,
) {
  if (nodeEnv !== "test" || !getTestDatabaseTarget(databaseUrl)) {
    throw new Error(
      "Database URL must target an approved local test database.",
    );
  }
}

export function assertTestDatabaseResetAllowed(
  databaseUrl: string | undefined,
  nodeEnv: string | undefined,
  allowReset: string | undefined,
  resetTarget: string | undefined,
) {
  const target = getTestDatabaseTarget(databaseUrl);

  if (
    nodeEnv !== "test" ||
    !target ||
    !RESETTABLE_DATABASE_TARGETS.has(target) ||
    allowReset !== "true" ||
    !databaseUrl ||
    resetTarget !== databaseUrl
  ) {
    throw new Error(
      "resetDatabase() requires explicit consent for an exact dedicated local test database.",
    );
  }
}
