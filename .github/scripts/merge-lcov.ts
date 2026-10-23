#!/usr/bin/env bun
import { resolve } from "node:path";

type FunctionCoverage = { line: number; name: string; hits: number };
type Coverage = {
  source: string;
  lines: Map<number, number>;
  functions: Map<string, FunctionCoverage>;
  branches: Map<string, number | null>;
  functionDefinitions: number;
  functionHits: number;
};

type RawRecord = {
  source: string;
  lines: Map<number, number>;
  branches: Map<string, number | null>;
  lineDefinitions: number;
  functionDefinitions?: number;
  functionHitsSummary?: number;
  branchDefinitions: number;
  functionNames: Array<{ line: number; name: string }>;
  functionHits: Map<string, number>;
};

type FunctionIdentityManifest = {
  version: 1;
  identityIncompleteSources: string[];
  unresolvedUncoveredSources: string[];
};

function addMax<K>(map: Map<K, number>, key: K, value: number) {
  map.set(key, Math.max(map.get(key) ?? 0, value));
}

function mergeBranch(
  map: Map<string, number | null>,
  key: string,
  hits: number | null,
) {
  const previous = map.get(key);
  map.set(
    key,
    hits === null ? (previous ?? null) : Math.max(previous ?? 0, hits),
  );
}

function parseSummaryCount(value: string, field: string, source: string) {
  const count = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(count)) {
    throw new Error(`Invalid LCOV ${field} summary for ${source}: ${value}`);
  }
  return count;
}

function summarizeFunctions(record: RawRecord) {
  const named = new Map<string, { line: number; name: string }>();
  for (const fn of record.functionNames) {
    named.set(`${fn.line}\0${fn.name}`, fn);
  }
  const namedHits = [...named.values()].filter(
    (fn) => (record.functionHits.get(fn.name) ?? 0) > 0,
  ).length;

  if (
    record.functionHitsSummary !== undefined &&
    record.functionDefinitions === undefined
  ) {
    throw new Error(`LCOV FNH summary is missing FNF for ${record.source}`);
  }
  if (
    record.functionDefinitions !== undefined &&
    record.functionDefinitions < named.size
  ) {
    throw new Error(
      `LCOV FNF is smaller than named functions for ${record.source}`,
    );
  }
  if (
    record.functionHitsSummary !== undefined &&
    record.functionHitsSummary < namedHits
  ) {
    throw new Error(`LCOV FNH is smaller than named hits for ${record.source}`);
  }
  if (
    record.functionDefinitions !== undefined &&
    record.functionHitsSummary !== undefined &&
    record.functionHitsSummary > record.functionDefinitions
  ) {
    throw new Error(`LCOV FNH exceeds FNF for ${record.source}`);
  }

  const definitions = Math.max(
    record.functionDefinitions ?? named.size,
    named.size,
  );
  const hits = Math.max(record.functionHitsSummary ?? namedHits, namedHits);
  const unnamedDefinitions = definitions - named.size;
  if (hits > namedHits + unnamedDefinitions) {
    throw new Error(
      `LCOV function summary conflicts with named hits for ${record.source}`,
    );
  }

  return {
    definitions,
    hits,
  };
}

function summarizeMergedFunctions(file: Coverage) {
  const functions = [...file.functions.values()];
  const definitions = Math.max(file.functionDefinitions, functions.length);
  const namedHits = functions.filter((fn) => fn.hits > 0).length;
  const hits = Math.max(file.functionHits, namedHits);
  const identityIncomplete = definitions > functions.length || hits > namedHits;

  return {
    definitions,
    hits,
    identityIncomplete,
    unresolvedUncovered: identityIncomplete && hits < definitions,
  };
}

function mergeFile(records: RawRecord[], files: Map<string, Coverage>) {
  for (const record of records) {
    const functionSummary = summarizeFunctions(record);
    if (record.lineDefinitions > 0 && record.lines.size === 0) {
      throw new Error(`LCOV line details missing for ${record.source}`);
    }
    if (record.branchDefinitions > 0 && record.branches.size === 0) {
      throw new Error(`LCOV branch details missing for ${record.source}`);
    }

    const file = files.get(record.source) ?? {
      source: record.source,
      lines: new Map<number, number>(),
      functions: new Map<string, FunctionCoverage>(),
      branches: new Map<string, number | null>(),
      functionDefinitions: 0,
      functionHits: 0,
    };
    file.functionDefinitions = Math.max(
      file.functionDefinitions,
      functionSummary.definitions,
    );
    file.functionHits = Math.max(file.functionHits, functionSummary.hits);
    for (const [line, hits] of record.lines) addMax(file.lines, line, hits);
    for (const fn of record.functionNames) {
      const key = `${fn.line}\0${fn.name}`;
      const previous = file.functions.get(key);
      file.functions.set(key, {
        ...fn,
        hits: Math.max(
          previous?.hits ?? 0,
          record.functionHits.get(fn.name) ?? 0,
        ),
      });
    }
    for (const [key, hits] of record.branches) {
      mergeBranch(file.branches, key, hits);
    }
    files.set(record.source, file);
  }
}

function parseLcov(content: string) {
  const records: RawRecord[] = [];
  let record: RawRecord | undefined;
  const finish = () => {
    if (record) {
      summarizeFunctions(record);
      records.push(record);
    }
    record = undefined;
  };

  for (const line of content.split(/\r?\n/)) {
    if (line.startsWith("SF:")) {
      finish();
      const path = line.slice(3);
      record = {
        source: resolve(path),
        lines: new Map(),
        branches: new Map(),
        lineDefinitions: 0,
        branchDefinitions: 0,
        functionNames: [],
        functionHits: new Map(),
      };
    } else if (line.startsWith("FN:") && record) {
      const [lineNumber, ...nameParts] = line.slice(3).split(",");
      const fnLine = Number(lineNumber);
      if (Number.isFinite(fnLine) && nameParts.length > 0) {
        record.functionNames.push({ line: fnLine, name: nameParts.join(",") });
      }
    } else if (line.startsWith("FNDA:") && record) {
      const [count, ...nameParts] = line.slice(5).split(",");
      const hits = Number(count);
      if (Number.isFinite(hits) && nameParts.length > 0) {
        const name = nameParts.join(",");
        addMax(record.functionHits, name, hits);
      }
    } else if (line.startsWith("DA:") && record) {
      const [lineNumber, count] = line.slice(3).split(",");
      const number = Number(lineNumber);
      const hits = Number(count);
      if (Number.isFinite(number) && Number.isFinite(hits)) {
        addMax(record.lines, number, hits);
      }
    } else if (line.startsWith("BRDA:") && record) {
      const [lineNumber, block, branch, taken] = line.slice(5).split(",");
      const hits = taken === "-" ? null : Number(taken);
      if (
        taken === "-" ||
        (typeof hits === "number" && Number.isFinite(hits))
      ) {
        mergeBranch(record.branches, `${lineNumber},${block},${branch}`, hits);
      }
    } else if (line.startsWith("LF:") && record) {
      record.lineDefinitions = Number(line.slice(3)) || 0;
    } else if (line.startsWith("FNF:") && record) {
      record.functionDefinitions = parseSummaryCount(
        line.slice(4),
        "FNF",
        record.source,
      );
    } else if (line.startsWith("FNH:") && record) {
      record.functionHitsSummary = parseSummaryCount(
        line.slice(4),
        "FNH",
        record.source,
      );
    } else if (line.startsWith("BRF:") && record) {
      record.branchDefinitions = Number(line.slice(4)) || 0;
    } else if (line === "end_of_record") {
      finish();
    }
  }
  finish();
  return records;
}

function renderLcov(files: Map<string, Coverage>) {
  return [...files.values()]
    .toSorted((a, b) => a.source.localeCompare(b.source))
    .map((file) => {
      const functions = [...file.functions.values()].toSorted(
        (a, b) => a.line - b.line || a.name.localeCompare(b.name),
      );
      const functionSummary = summarizeMergedFunctions(file);
      const lines = [...file.lines].toSorted((a, b) => a[0] - b[0]);
      const branches = [...file.branches].toSorted((a, b) =>
        a[0].localeCompare(b[0]),
      );
      return [
        `SF:${file.source}`,
        ...functions.flatMap((fn) => [
          `FN:${fn.line},${fn.name}`,
          `FNDA:${fn.hits},${fn.name}`,
        ]),
        `FNF:${functionSummary.definitions}`,
        `FNH:${functionSummary.hits}`,
        ...lines.map(([line, hits]) => `DA:${line},${hits}`),
        `LF:${lines.length}`,
        `LH:${lines.filter(([, hits]) => hits > 0).length}`,
        ...branches.map(([key, hits]) => `BRDA:${key},${hits ?? "-"}`),
        `BRF:${branches.length}`,
        `BRH:${branches.filter(([, hits]) => hits !== null && hits > 0).length}`,
        "end_of_record",
      ].join("\n");
    })
    .join("\n")
    .concat("\n");
}

function functionIdentityManifest(
  files: Map<string, Coverage>,
): FunctionIdentityManifest {
  const records = [...files.values()].toSorted((a, b) =>
    a.source.localeCompare(b.source),
  );
  return {
    version: 1,
    identityIncompleteSources: records
      .filter((file) => summarizeMergedFunctions(file).identityIncomplete)
      .map((file) => file.source),
    unresolvedUncoveredSources: records
      .filter((file) => summarizeMergedFunctions(file).unresolvedUncovered)
      .map((file) => file.source),
  };
}

async function main() {
  const inputs = process.argv.slice(2);
  if (inputs.length === 0) throw new Error("Pass LCOV files to merge.");

  const files = new Map<string, Coverage>();
  for (const path of inputs) {
    const input = Bun.file(path);
    if (!(await input.exists()))
      throw new Error(`Coverage file missing: ${path}`);
    const content = await input.text();
    if (!content.trim()) throw new Error(`Coverage file is empty: ${path}`);
    const records = parseLcov(content);
    if (records.length === 0) {
      throw new Error(`No LCOV records were found in: ${path}`);
    }
    mergeFile(records, files);
  }
  if (files.size === 0) throw new Error("No LCOV records were found.");

  await Bun.write("coverage/lcov.merged.info", renderLcov(files));
  await Bun.write(
    "coverage/lcov.function-identity.json",
    `${JSON.stringify(functionIdentityManifest(files), null, 2)}\n`,
  );
  console.log(`Merged LCOV coverage for ${files.size} source files.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
