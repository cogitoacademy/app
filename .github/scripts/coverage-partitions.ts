/** Each instrumented process owns its output; worker globals must never overwrite it. */
export function isolatedIntegrationPartitions(
  files: string[],
  databaseUrl: string,
) {
  return files.toSorted().map((path, index) => ({
    name: `api-resettable-${String(index + 1).padStart(3, "0")}`,
    arguments: [path],
    env: {
      TEST_DATABASE_ALLOW_RESET: "true",
      TEST_DATABASE_RESET_TARGET: databaseUrl,
    },
  }));
}
