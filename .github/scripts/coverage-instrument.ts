import { plugin } from "bun";
import { afterAll } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { CoverageMapData } from "istanbul-lib-coverage";
import { coverageSources } from "./coverage-sources";

const output = process.env.COUNTER_COVERAGE_FILE;
if (!output) throw new Error("COUNTER_COVERAGE_FILE is required");
const destination = resolve(output);
rmSync(destination, { force: true });
const sources = coverageSources();
const escape = (value: string) =>
  [...value]
    .map((character) =>
      "\\^$.*+?()[]{}|".includes(character) ? "\\" + character : character,
    )
    .join("");
plugin({
  name: "istanbul-counter-coverage",
  setup(build) {
    build.onLoad(
      {
        filter: new RegExp(
          `^(?:${sources.directories.map(escape).join("|")})` +
            String.raw`[/\\].*\.[cm]?[jt]sx?(?:\?.*)?$`,
        ),
      },
      ({ path: modulePath }) => {
        const path = modulePath.split("?")[0]!;
        return {
          // Bun 1.3 requires explicit passthrough for excluded files matching onLoad.
          contents: sources.compiled.get(path) ?? readFileSync(path, "utf8"),
          loader: path.endsWith("tsx")
            ? "tsx"
            : /\.[cm]?ts$/.test(path)
              ? "ts"
              : path.endsWith("jsx")
                ? "jsx"
                : "js",
        };
      },
    );
  },
});
function flush() {
  const counters =
    (Reflect.get(globalThis, "__coverage__") as CoverageMapData | undefined) ??
    {};
  const coverage: CoverageMapData = {};
  // Unloaded and mocked modules retain zero counters rather than disappearing.
  for (const [path, empty] of Object.entries(sources.coverage))
    coverage[path] = counters[path] ?? empty;
  mkdirSync(dirname(destination), { recursive: true });
  writeFileSync(
    destination,
    JSON.stringify({
      version: 1,
      root: sources.root,
      hashes: sources.hashes,
      coverage,
    }),
  );
}
// Bun 1.3's test runner does not consistently emit Node's exit event.
afterAll(flush);
process.on("exit", flush);
