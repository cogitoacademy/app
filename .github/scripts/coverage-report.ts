import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import {
  createCoverageMap,
  type CoverageMapData,
  type FileCoverageData,
} from "istanbul-lib-coverage";
import { createContext } from "istanbul-lib-report";
import { create } from "istanbul-reports";
import { coverageSources } from "./coverage-sources";

function assertCounters(
  actual: Record<string, unknown>,
  expected: Record<string, unknown>,
  name: string,
) {
  if (
    !actual ||
    JSON.stringify(Object.keys(actual).toSorted()) !==
      JSON.stringify(Object.keys(expected).toSorted())
  )
    throw new Error(`Coverage counter identities differ: ${name}`);
  for (const [id, value] of Object.entries(actual)) {
    const counters = Array.isArray(value) ? value : [value];
    const baseline = expected[id];
    if (Array.isArray(baseline) && counters.length !== baseline.length)
      throw new Error(`Coverage branch identities differ: ${name}`);
    if (
      counters.some((counter) => !Number.isSafeInteger(counter) || counter < 0)
    )
      throw new Error(`Invalid coverage counter: ${name}`);
  }
}
function assertFile(actual: FileCoverageData, baseline: FileCoverageData) {
  if (!actual || actual.path !== baseline.path)
    throw new Error("Coverage source identity differs");
  for (const key of ["statementMap", "fnMap", "branchMap"] as const)
    if (JSON.stringify(actual[key]) !== JSON.stringify(baseline[key]))
      throw new Error(`Coverage source map differs: ${actual.path}`);
  assertCounters(actual.s, baseline.s, actual.path);
  assertCounters(actual.f, baseline.f, actual.path);
  assertCounters(actual.b, baseline.b, actual.path);
}

async function main() {
  for (const name of [
    "lcov.info",
    "lcov.merged.info",
    "lcov.function-identity.json",
    "counters.merged.json",
  ])
    rmSync(resolve("coverage", name), { force: true });
  const inputs = process.argv.slice(2);
  if (!inputs.length) throw new Error("Pass partition counter JSON files");
  const sources = coverageSources();
  const merged = createCoverageMap({});
  for (const input of inputs) {
    const profile = JSON.parse(readFileSync(input, "utf8")) as {
      version: number;
      root: string;
      hashes: Record<string, string>;
      coverage: CoverageMapData;
    };
    if (
      profile.version !== 1 ||
      profile.root !== sources.root ||
      JSON.stringify(profile.hashes) !== JSON.stringify(sources.hashes) ||
      JSON.stringify(Object.keys(profile.coverage).toSorted()) !==
        JSON.stringify(Object.keys(sources.coverage).toSorted())
    )
      throw new Error(`Missing or stale coverage source inventory: ${input}`);
    for (const [path, baseline] of Object.entries(sources.coverage))
      assertFile(profile.coverage[path]!, baseline);
    merged.merge(profile.coverage);
  }
  // LCOV keys functions by name. Include stable declaration positions so nested
  // functions sharing a name cannot collapse into one covered identity.
  for (const path of merged.files()) {
    const file = merged.fileCoverageFor(path);
    for (const fn of Object.values(file.data.fnMap))
      fn.name = `${fn.name}@${fn.decl.start.line}:${fn.decl.start.column}`;
  }
  mkdirSync("coverage", { recursive: true });
  const context = createContext({
    dir: resolve("coverage"),
    coverageMap: merged,
  });
  create("lcovonly").execute(context);
  create("json", { file: "counters.merged.json" }).execute(context);
  create("text-summary").execute(context);
  const validation = Bun.spawn(
    [
      process.execPath,
      resolve(import.meta.dir, "merge-lcov.ts"),
      "coverage/lcov.info",
    ],
    { stdout: "inherit", stderr: "inherit" },
  );
  if ((await validation.exited) !== 0)
    throw new Error("Generated LCOV failed strict validation");
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
