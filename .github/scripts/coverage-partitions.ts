import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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

export function parseCoverageArguments(args: string[]) {
  const groups: string[] = [];
  let list = false;
  let collectOnly = false;
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === "--list") list = true;
    else if (argument === "--collect-only") collectOnly = true;
    else if (argument === "--group") {
      const name = args[++index];
      if (!name || name.startsWith("--"))
        throw new Error("--group requires a partition name");
      groups.push(name);
    } else throw new Error(`Unknown coverage runner argument: ${argument}`);
  }
  return { groups, list, collectOnly };
}

export function selectCoveragePartitions<T extends { name: string }>(
  partitions: T[],
  groups: string[],
) {
  for (const group of groups)
    if (!partitions.some(({ name }) => name === group))
      throw new Error(`Unknown coverage group: ${group}. Use --list.`);
  return groups.length
    ? partitions.filter(({ name }) => groups.includes(name))
    : partitions;
}

/** Resetting suites need their own process regardless of their directory name. */
export function discoverResettableTests(root: string, excluded: string[] = []) {
  return [...new Bun.Glob("**/*.test.ts").scanSync({ cwd: root })]
    .map((path) => path.replaceAll("\\", "/"))
    .filter((path) =>
      /\bresetDatabase\s*\(/.test(readFileSync(resolve(root, path), "utf8")),
    )
    .map((path) => `./${root}/${path}`)
    .filter((path) => !excluded.includes(path))
    .toSorted();
}
