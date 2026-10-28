import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { createInstrumenter } from "istanbul-lib-instrument";
import type { CoverageMapData } from "istanbul-lib-coverage";

export function coverageSources(root = process.cwd()) {
  const directories = [
    "packages/api/src",
    "packages/auth/src",
    "packages/db/src",
    "packages/env/src",
  ].map((directory) => resolve(root, directory));
  const files: string[] = [];
  function visit(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (
          relative(root, path).replaceAll("\\", "/") !==
            "packages/db/src/schema" &&
          entry.name !== "node_modules"
        )
          visit(path);
      } else if (
        entry.isFile() &&
        /\.[cm]?[jt]sx?$/.test(entry.name) &&
        !/\.(?:test|spec|d)\.[cm]?[jt]sx?$/.test(entry.name)
      )
        files.push(path);
    }
  }
  for (const directory of directories) {
    const path = relative(root, directory);
    if (!path || path.startsWith("..") || isAbsolute(path))
      throw new Error(
        "Coverage source directories must be inside the project root",
      );
    visit(directory);
  }
  if (!files.length) throw new Error("No coverage sources found");
  const instrumenter = createInstrumenter({
    esModules: true,
    parserPlugins: [
      "typescript",
      "importAttributes",
      "explicitResourceManagement",
    ],
    coverageGlobalScope: "globalThis",
    coverageGlobalScopeFunc: false,
  });
  const coverage: CoverageMapData = {};
  const hashes: Record<string, string> = {};
  const compiled = new Map<string, string>();
  for (const path of [...new Set(files)].toSorted()) {
    const source = readFileSync(path, "utf8");
    compiled.set(path, instrumenter.instrumentSync(source, path));
    coverage[path] = instrumenter.lastFileCoverage();
    hashes[path] = createHash("sha256").update(source).digest("hex");
  }
  return { root: resolve(root), directories, coverage, hashes, compiled };
}
